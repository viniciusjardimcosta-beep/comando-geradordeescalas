import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadXlsx,
  saveXlsx,
  getSheetXml,
  readCell,
  iterRows,
  applyEdits,
  writeSheetXml,
  makeRef,
  type CellEdit,
} from "./xlsx-surgical";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

const ParametrosSchema = z.object({
  militaresPorDia: z.number().int().min(1).max(20).default(4),
  minCovPorDia: z.number().int().min(0).max(10).default(1),
  minCgPorDia: z.number().int().min(0).max(10).default(1),
  observacoesTexto: z.string().max(10000).default(""),
  /**
   * Modo de geração:
   *  - "auto": gera 24x72, tapa furos com HE, completa carga (CM/EXP) e entrega escala final.
   *  - "ordinario_puro": gera apenas a ordinária 24x72 respeitando indisponibilidades.
   *    NÃO tapa furos, NÃO lança HE, NÃO completa carga. Apenas registra alertas dos problemas.
   */
  modo: z.enum(["auto", "ordinario_puro"]).default("auto"),
});

const InputSchema = z.object({
  fileBase64: z.string().min(100).max(11_000_000), // ~8 MB after base64
  fileName: z.string().min(1).max(255),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2024).max(2100),
  parametros: ParametrosSchema,
  /** ignorar aviso de mês/ano divergente da planilha */
  forcarMesAno: z.boolean().optional().default(false),
  /** Militares que estavam de serviço no último dia do mês anterior. Iniciam o mês com apenas 8h. */
  viradaAnterior: z.array(z.object({
    militarId: z.string().uuid(),
    tipo: z.enum(["ord", "he"]).default("ord"),
  })).optional().default([]),
});

type Alerta = { tipo: "info" | "warn" | "error"; msg: string };

// Siglas válidas extraídas do glossário da planilha oficial
const SIGLAS_AFASTAMENTO = new Set([
  "RDC","F","LTS","OP","VIA","LAS","LFC","LGE","LAD","LPA","LE","LIP","FE",
  "LCC","LIN","TRA","FJ","RSP","FER","DIS","LGL","LNJ","LAA","CBA","CTSP","C",
  "TRF","CA1","FN","FNJ","DCP","DSP","AFM","DOA","LRP","LSI","PRD","AGA","AGM",
  "PRA","PRS","PPR","PSC","PRT","LAI","CPR","CPS","LAC","LCJ","LFE","PRE","DES",
  "EDT","AJS","AGJ","LMC","LDC","LQE","LQP","PR","CA","RR","CA2","CA3","CA4",
  "FC1","FC2","FC3","FC4","FC5","FC6",
]);
const SIGLAS_ORD_VALIDAS = new Set([
  "1","2","3","4","12","13","14","23","24","34","123","124","134","234","1234","2341",
  "C1","C2","C3","C4","OS","IN","SSCI",
  "SS03","SS06","SS09","SS12","SS15","SS18","SS21","SS24",
  "CV1","CV2","CV3","CV4","CV5","CV6","CV7","CV8","CV9","CV10","CV11","CV12",
  ...Array.from(SIGLAS_AFASTAMENTO),
]);
const SIGLAS_COMP_VALIDAS = new Set<string>();
for (let i = 1; i <= 12; i++) SIGLAS_COMP_VALIDAS.add(`EXP${i}`);
for (let i = 1; i <= 16; i++) SIGLAS_COMP_VALIDAS.add(`CM${i}`);
for (let i = 1; i <= 8; i++) SIGLAS_COMP_VALIDAS.add(`TELE${i}`);
const SIGLAS_HE_VALIDAS = new Set<string>();
for (let i = 1; i <= 24; i++) SIGLAS_HE_VALIDAS.add(`HE${i}`);

interface AfastamentoIA {
  matricula?: string;
  nome?: string;
  diaInicio: number;
  diaFim: number;
  motivo?: string;
  /** sigla específica da planilha — ex: FER, LTS, LAA, F, RDC */
  sigla?: string;
}
interface LancamentoIA {
  matricula?: string;
  nome?: string;
  dias: number[];
  /** linha onde lançar: ORD (padrão), EXP (expediente/compensação) ou HE (hora extra) */
  linha?: "ORD" | "EXP" | "HE";
  /** sigla exata a lançar (ex: HE6, CM3, EXP9, 123, 2341, C2) */
  sigla: string;
  /** lançamento sintético gerado pelo sistema — não emite alerta individual */
  __silent?: boolean;
}
interface ReforcoIA {
  dia: number;
  militaresPorDia?: number;
  minCov?: number;
  minCg?: number;
  obs?: string;
}
interface ExcecaoIA {
  matricula?: string;
  nome?: string;
  dias: number[];
  acao: "nao_escalar" | "somente_cg" | "somente_cov" | "obrigatorio";
}
interface ViradaAnteriorIA {
  matricula?: string;
  nome?: string;
  /** "ord" = serviço 24h ordinário em D31 do mês anterior; "he" = HE 24h em D31 anterior */
  tipo: "ord" | "he";
}
interface LimiteHeIA {
  /** filtro por posto/papel: "sgt", "sd", "cb", "ten", "all". Mutuamente exclusivo com nome/matrícula. */
  postoOuPapel?: "sgt" | "sd" | "cb" | "ten" | "all";
  matricula?: string;
  nome?: string;
  /** teto absoluto de HE no mês para o(s) alvo(s). */
  maxHoras: number;
  /** preferir distribuir HE igualmente entre os alvos. */
  equalizar?: boolean;
  /** preferir blocos longos (HE16+HE8 = 24h) em vez de fragmentar em HE6/HE8 isolados. */
  evitarFragmentar?: boolean;
}
interface InterpretacaoIA {
  afastamentos: AfastamentoIA[];
  reforcos: ReforcoIA[];
  excecoes: ExcecaoIA[];
  lancamentos: LancamentoIA[];
  viradaAnterior: ViradaAnteriorIA[];
  limitesHe: LimiteHeIA[];
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function normMatricula(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}
function normNome(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();
}
function diasNoMes(mes: number, ano: number) {
  return new Date(ano, mes, 0).getDate();
}

function dataKey(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function pascoaGregoriana(ano: number) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function feriadosBrasil(ano: number) {
  const keys = new Set<string>();
  const add = (mes: number, dia: number) => keys.add(dataKey(ano, mes, dia));
  [
    [1, 1], [4, 21], [5, 1], [9, 7], [9, 20], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25],
  ].forEach(([mes, dia]) => add(mes, dia));
  const pascoa = pascoaGregoriana(ano);
  const addRel = (offset: number) => {
    const d = new Date(pascoa);
    d.setUTCDate(d.getUTCDate() + offset);
    add(d.getUTCMonth() + 1, d.getUTCDate());
  };
  addRel(-48); // Carnaval segunda
  addRel(-47); // Carnaval terça
  addRel(-2);  // Sexta-feira Santa
  addRel(60);  // Corpus Christi
  return keys;
}

function isFeriado(ano: number, mes: number, dia: number) {
  return feriadosBrasil(ano).has(dataKey(ano, mes, dia));
}

function isDiaExpediente(ano: number, mes: number, dia: number) {
  const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return dow >= 1 && dow <= 5 && !isFeriado(ano, mes, dia);
}

function rotuloSemana(ano: number, mes: number, dia: number) {
  return ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."][
    new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  ];
}

function excelSerialUTC(ano: number, mes: number, dia: number) {
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86400000) + 25569;
}

/* ------------------------------------------------------------------ */
/* Lovable AI — interpretar observações livres em JSON                */
/* ------------------------------------------------------------------ */

async function interpretarObservacoes(
  texto: string,
  efetivo: { nome: string; matricula: string }[],
  mes: number,
  ano: number,
): Promise<InterpretacaoIA> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const vazia: InterpretacaoIA = { afastamentos: [], reforcos: [], excecoes: [], lancamentos: [], viradaAnterior: [], limitesHe: [] };
  if (!apiKey || !texto.trim()) return vazia;

  const efetivoCompacto = efetivo
    .slice(0, 200)
    .map((m) => `${m.matricula}|${m.nome}`)
    .join("\n");

  const sys = `Você é um interpretador de observações de escala militar (BM).
Mês alvo: ${NOMES_MES[mes - 1]}/${ano}.

Converta o texto do usuário em JSON estruturado com 6 seções:

1) afastamentos: períodos em que militar NÃO entra na escala ordinária.
   - motivos comuns → sigla a lançar na célula do dia (linha ORD):
     férias=FER, licença tratamento saúde=LTS, LP=LP, licença gestante=LGE, licença paternidade=LPA,
     licença adoção=LAD, dispensa=DIS, curso=CA, folga=F, RDC=RDC, afastamento médico=AFM,
     luto=LNJ, atestado curto=FE, licença alun/aluno=LAA, trânsito=TRA, etc.
   - Se o usuário disser só "férias", use "FER". Se falar só "licença" sem detalhar, use "LTS".

2) lancamentos: comandos diretos de sigla em dias específicos, em linhas específicas:
   - linha "HE" (hora extra) → siglas HE1..HE24
   - linha "EXP" (expediente/compensação) → siglas EXP1..EXP12, CM1..CM16, TELE1..TELE8
   - linha "ORD" (padrão) → siglas numéricas (123, 12, 1, 2, 3, 4, 23, 234), C1..C4, OS, CV1..CV12, SSxx
   - NUNCA usar a sigla "2341" — serviço de 24h é representado por "234" no dia D + "1" no dia D+1 automaticamente.
   - Ex.: "dia 04 lançar HE2 para todos" → lancamentos com sigla=HE2, linha=HE, dias=[4] (sem nome = todos).
   - Ex.: "Sgt X CM3 dia 10" → sigla=CM3, linha=EXP, dias=[10], nome=X.

3) reforcos: alterar a quantidade padrão de militares/COV/CG em dias específicos.

4) excecoes: regras pontuais (nao_escalar, somente_cg, somente_cov, obrigatorio).

5) viradaAnterior: militares que estavam de SERVIÇO no ÚLTIMO DIA do mês ANTERIOR (esse serviço termina às 08h do dia 01 do mês corrente).
   - tipo "ord": fez serviço 24h ordinário em D31 (ou D28/D30) anterior. No dia 01 do mês atual recebe automaticamente
     ORD=1 (madrugada 02h-08h) + EXP=CM2 (00h-02h fechando 8h da virada). Bloqueia ORD nos dias 1 e 2.
   - tipo "he": fez HE 24h em D31 anterior. No dia 01 atual recebe HE=HE8.
   - Frases típicas: "Sgt X de serviço dia 31 do mês passado", "Cb Y fez serviço no último dia do mês anterior",
     "Sd Z entrou de HE no fim do mês passado".

6) limitesHe: tetos de HE no mês e regras de equalização. **OBRIGATÓRIO** preencher SEMPRE que o usuário mencionar QUALQUER uma destas palavras:
   limite, máximo, máx, teto, no max, até X horas, igualar, equalizar, distribuir igual, dividir igual,
   distribuição igualitária, equilibrar, mesma quantidade, todos com a mesma carga, distribuídas igualmente.
   - "limitar HE dos sargentos a 24h cada, igualmente distribuídas" → { postoOuPapel: "sgt", maxHoras: 24, equalizar: true }
   - "limitar as HE dos sargentos em 24 cada um igualmente distribuidas" → { postoOuPapel: "sgt", maxHoras: 24, equalizar: true }
   - "no máximo 24 HE para os sgts e equalizar" → { postoOuPapel: "sgt", maxHoras: 24, equalizar: true }
   - "equalizar HE dos soldados" / "distribuir HE dos sd igualmente" → { postoOuPapel: "sd", maxHoras: 999, equalizar: true }
   - "equalizar HE dos soldados sem fragmentar muito" → { postoOuPapel: "sd", maxHoras: 999, equalizar: true, evitarFragmentar: true }
   - "Sgt X no máximo 12h de HE no mês" → { nome: "X", maxHoras: 12 }
   - postoOuPapel aceita: "sgt", "sd", "cb", "ten", "all". Use "all" para todos.
   - Se o usuário pedir várias regras (ex.: "sgts limitados a 24 e soldados equalizados"), gere UMA entrada para CADA regra.
   - equalizar=true → motor distribui HE preferindo quem tem MENOS HE no mês.
   - evitarFragmentar=true → motor prefere lançar HE em blocos maiores (HE16/HE8) e evita HE3/HE4 isolados.
   - Sempre que houver "limite máximo" + "equalizado/igualitário/distribuído igual", marcar equalizar=true.
   - NUNCA deixe limitesHe vazio se o usuário pediu qualquer forma de equalização ou limite.

Identifique militares por matrícula quando possível; senão por nome.
Dias sem mês explícito são do mês corrente. Sempre devolva inteiros 1-31.
Se a observação não pedir nada que caiba numa seção, deixe array vazio.`;

  const tools = [{
    type: "function",
    function: {
      name: "interpretar_observacoes",
      description: "Estrutura observações em afastamentos, lançamentos, reforços, exceções e virada do mês anterior.",
      parameters: {
        type: "object",
        properties: {
          afastamentos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                matricula: { type: "string" },
                nome: { type: "string" },
                diaInicio: { type: "integer" },
                diaFim: { type: "integer" },
                motivo: { type: "string" },
                sigla: { type: "string" },
              },
              required: ["diaInicio", "diaFim"],
            },
          },
          lancamentos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                matricula: { type: "string" },
                nome: { type: "string" },
                dias: { type: "array", items: { type: "integer" } },
                linha: { type: "string", enum: ["ORD", "EXP", "HE"] },
                sigla: { type: "string" },
              },
              required: ["dias", "sigla"],
            },
          },
          reforcos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dia: { type: "integer" },
                militaresPorDia: { type: "integer" },
                minCov: { type: "integer" },
                minCg: { type: "integer" },
                obs: { type: "string" },
              },
              required: ["dia"],
            },
          },
          excecoes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                matricula: { type: "string" },
                nome: { type: "string" },
                dias: { type: "array", items: { type: "integer" } },
                acao: {
                  type: "string",
                  enum: ["nao_escalar", "somente_cg", "somente_cov", "obrigatorio"],
                },
              },
              required: ["dias", "acao"],
            },
          },
          viradaAnterior: {
            type: "array",
            items: {
              type: "object",
              properties: {
                matricula: { type: "string" },
                nome: { type: "string" },
                tipo: { type: "string", enum: ["ord", "he"] },
              },
              required: ["tipo"],
            },
          },
          limitesHe: {
            type: "array",
            items: {
              type: "object",
              properties: {
                postoOuPapel: { type: "string", enum: ["sgt", "sd", "cb", "ten", "all"] },
                matricula: { type: "string" },
                nome: { type: "string" },
                maxHoras: { type: "integer" },
                equalizar: { type: "boolean" },
                evitarFragmentar: { type: "boolean" },
              },
              required: ["maxHoras"],
            },
          },
        },
        required: ["afastamentos", "lancamentos", "reforcos", "excecoes", "viradaAnterior", "limitesHe"],
      },
    },
  }];

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content:
              `Efetivo (matrícula|nome):\n${efetivoCompacto}\n\n` +
              `Observações do usuário:\n${texto}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "interpretar_observacoes" } },
      }),
    });
    if (!r.ok) {
      console.error("AI gateway", r.status, await r.text().catch(() => ""));
      return vazia;
    }
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return vazia;
    const parsed = JSON.parse(args) as Partial<InterpretacaoIA>;
    return {
      afastamentos: Array.isArray(parsed.afastamentos) ? parsed.afastamentos : [],
      lancamentos: Array.isArray(parsed.lancamentos) ? parsed.lancamentos : [],
      reforcos: Array.isArray(parsed.reforcos) ? parsed.reforcos : [],
      excecoes: Array.isArray(parsed.excecoes) ? parsed.excecoes : [],
      viradaAnterior: Array.isArray(parsed.viradaAnterior) ? parsed.viradaAnterior : [],
      limitesHe: Array.isArray(parsed.limitesHe) ? parsed.limitesHe : [],
    };
  } catch (e) {
    console.error("interpretarObservacoes", e);
    return vazia;
  }
}

/* ------------------------------------------------------------------ */
/* Motor de escala                                                    */
/* ------------------------------------------------------------------ */

interface MilitarRT {
  rowOrd: number; // linha 1-indexed da linha ORD (R12, R15, ...)
  nome: string;
  nomeNorm: string;
  matricula: string;
  /** posto/graduação textual (ex.: "1º Sargento QPBM", "Soldado QPBM – 1ª Classe", "1º Tenente QTBM"). */
  posto: string;
  /** categoria simplificada para limites de HE: "ten" | "sgt" | "cb" | "sd" | "outro". */
  postoCat: "ten" | "sgt" | "cb" | "sd" | "outro";
  isCov: boolean;
  isCg: boolean;
  isAdm: boolean;
  ativo: boolean;
  cargaH: number;
  ultimoServico: number;
  afastDias: Set<number>;
  afastSigla: Map<number, string>; // dia -> sigla afastamento (ex: FER, LTS)
  /** ordem do grupo de escala ordinária (1..N). undefined = sem grupo definido */
  grupoOrdem?: number;
  /** "24h" = ciclo operacional 24x72; "parcial" = só turnos curtos em dias úteis */
  tipoEscala: "24h" | "parcial";
}

function classificarPosto(p: string): "ten" | "sgt" | "cb" | "sd" | "outro" {
  const s = (p ?? "").toLowerCase();
  if (s.includes("tenente") || /\bten\b/.test(s)) return "ten";
  if (s.includes("sargento") || /\bsgt\b/.test(s) || /\bsg\b/.test(s)) return "sgt";
  if (s.includes("cabo") || /\bcb\b/.test(s)) return "cb";
  if (s.includes("soldado") || /\bsd\b/.test(s)) return "sd";
  return "outro";
}

function escalar(
  militares: MilitarRT[],
  dias: number,
  mes: number,
  ano: number,
  par: z.infer<typeof ParametrosSchema>,
  ia: InterpretacaoIA,
  alertas: Alerta[],
): { ord: Map<number, Map<number, string>>; exp: Map<number, Map<number, string>>; he: Map<number, Map<number, string>> } {
  const ord = new Map<number, Map<number, string>>();
  const expm = new Map<number, Map<number, string>>();
  const he = new Map<number, Map<number, string>>();
  for (let d = 1; d <= dias; d++) {
    ord.set(d, new Map());
    expm.set(d, new Map());
    he.set(d, new Map());
  }

  const findMilitar = (matricula?: string, nome?: string): MilitarRT | undefined => {
    const mn = normMatricula(matricula);
    if (mn) {
      const m = militares.find((x) => x.matricula === mn);
      if (m) return m;
    }
    if (nome) {
      const nm = normNome(nome);
      return militares.find((x) => x.nomeNorm.includes(nm) || nm.includes(x.nomeNorm));
    }
    return undefined;
  };

  // ===== Limites de HE (vindos de ia.limitesHe) =====
  // Para cada militar, calcular o teto de HE no mês e flags equalizar/evitarFragmentar.
  const limiteHePorMilitar = new Map<number, { max: number; equalizar: boolean; evitarFragmentar: boolean }>();
  const aplicaLimiteEm = (m: MilitarRT, lim: LimiteHeIA) => {
    const cur = limiteHePorMilitar.get(m.rowOrd);
    const max = Math.min(cur?.max ?? Number.POSITIVE_INFINITY, lim.maxHoras);
    limiteHePorMilitar.set(m.rowOrd, {
      max,
      equalizar: !!(cur?.equalizar || lim.equalizar),
      evitarFragmentar: !!(cur?.evitarFragmentar || lim.evitarFragmentar),
    });
  };
  for (const lim of ia.limitesHe ?? []) {
    if (lim.matricula || lim.nome) {
      const m = findMilitar(lim.matricula, lim.nome);
      if (m) aplicaLimiteEm(m, lim);
      continue;
    }
    const cat = lim.postoOuPapel ?? "all";
    for (const m of militares) {
      if (cat === "all" || m.postoCat === cat) aplicaLimiteEm(m, lim);
    }
  }
  // Soma de horas HE já lançadas no mês para um militar
  const horasHeMes = (m: MilitarRT): number => {
    let total = 0;
    for (let d = 1; d <= dias; d++) {
      const s = he.get(d)?.get(m.rowOrd);
      if (!s) continue;
      const mt = /^HE(\d{1,2})$/i.exec(s);
      if (mt) total += Number(mt[1]);
    }
    return total;
  };
  const limiteRestanteHe = (m: MilitarRT): number => {
    const lim = limiteHePorMilitar.get(m.rowOrd);
    if (!lim) return Number.POSITIVE_INFINITY;
    return Math.max(0, lim.max - horasHeMes(m));
  };
  // 0ª ETAPA — Virada do mês anterior.
  // Militares que fizeram serviço/HE 24h em D31 do mês passado recebem no dia 01:
  //   - tipo "ord" → ORD=1 (madrugada) + EXP=CM2 (00h-02h). +8h carga. Bloqueia ORD dias 1 e 2.
  //   - tipo "he"  → HE=HE8. Bloqueia ORD no dia 1.
  const bloqueioPosVirada = new Map<number, Set<number>>();
  for (let d = 1; d <= dias; d++) bloqueioPosVirada.set(d, new Set());

  /* ---- Carga horária mensal ---- */
  // Carga base por dias do mês (mesma fórmula da planilha)
  const cargaBase = (d: number): number =>
    ({ 28: 160, 29: 165, 30: 171, 31: 177 } as Record<number, number>)[d] ?? 177;

  const ORD_HORAS: Record<string, number> = {
    "1": 6, "2": 6, "3": 6, "4": 6,
    "12": 12, "13": 12, "14": 12, "23": 12, "24": 12, "34": 12,
    "123": 18, "124": 18, "134": 18, "234": 18,
    "1234": 24, "2341": 24,
  };
  const horasOrdSigla = (s: string): number => ORD_HORAS[s] ?? 0;

  const horasOrdAcumuladas = (m: MilitarRT): number => {
    let total = 0;
    for (let d = 1; d <= dias; d++) {
      const s = ord.get(d)?.get(m.rowOrd);
      if (s && !SIGLAS_AFASTAMENTO.has(s)) total += horasOrdSigla(s);
    }
    return total;
  };

  const horasCompSigla = (s: string): number => {
    const mt = /^(?:EXP|CM|TELE)(\d{1,2})$/i.exec(s.trim());
    return mt ? Number(mt[1]) : 0;
  };
  const horasCompDia = (m: MilitarRT, d: number): number => {
    const s = expm.get(d)?.get(m.rowOrd);
    return s ? horasCompSigla(s) : 0;
  };
  const horasExpSigla = horasCompSigla;
  const horasExpDia = horasCompDia;
  const horasCompAcumuladas = (m: MilitarRT): number => {
    let total = 0;
    for (let d = 1; d <= dias; d++) total += horasCompDia(m, d);
    return total;
  };
  const horasOrdinariasAcumuladas = (m: MilitarRT): number =>
    horasOrdAcumuladas(m) + horasCompAcumuladas(m);

  const horasHeSigla = (s: string): number => {
    const mt = /^HE(\d{1,2})$/i.exec(s.trim());
    return mt ? Number(mt[1]) : 0;
  };
  const horasHeDia = (m: MilitarRT, d: number): number => {
    const s = he.get(d)?.get(m.rowOrd);
    return s ? horasHeSigla(s) : 0;
  };

  const horasOcupadasNoDia = (m: MilitarRT, d: number): number => {
    let total = 0;
    const sOrd = ord.get(d)?.get(m.rowOrd);
    if (sOrd) {
      if (SIGLAS_AFASTAMENTO.has(sOrd)) return 24;
      total += horasOrdSigla(sOrd);
    }
    total += horasCompDia(m, d);
    total += horasHeDia(m, d);
    return total;
  };

  // Carga mensal proporcional ao número de dias afastados.
  // Usa Math.round para casar com o cálculo manual da planilha (ex.: 119.9 -> 120),
  // evitando split indevido em CM5+HE1 quando o turno cheio de 6h fecharia exato.
  const cargaMensalProporcional = (af: number): number => {
    const bruto = cargaBase(dias) * (1 - af / dias);
    return Math.round(bruto);
  };

  // Teto ORD do militar: carga base reduzida proporcionalmente pelos dias de afastamento.
  // Calculado uma vez por chamada porque os afastamentos da etapa 1 já estão lançados.
  const cargaMaxOrdCache = new Map<number, number>();
  const cargaMaxOrd = (m: MilitarRT): number => {
    const cached = cargaMaxOrdCache.get(m.rowOrd);
    if (cached !== undefined) return cached;
    let af = 0;
    for (let d = 1; d <= dias; d++) {
      const s = ord.get(d)?.get(m.rowOrd);
      if (s && SIGLAS_AFASTAMENTO.has(s)) af++;
    }
    const teto = cargaMensalProporcional(af);
    cargaMaxOrdCache.set(m.rowOrd, teto);
    return teto;
  };
  const viradasAplicadas: string[] = [];
  for (const v of ia.viradaAnterior ?? []) {
    const m = findMilitar(v.matricula, v.nome);
    if (!m) continue;
    if (v.tipo === "ord") {
      ord.get(1)!.set(m.rowOrd, "1");
      expm.get(1)!.set(m.rowOrd, "CM2");
      m.cargaH += 8;
      bloqueioPosVirada.get(1)!.add(m.rowOrd);
      if (dias >= 2) bloqueioPosVirada.get(2)!.add(m.rowOrd);
      viradasAplicadas.push(`${m.nome} (ORD 1+CM2 dia 01)`);
    } else if (v.tipo === "he") {
      he.get(1)!.set(m.rowOrd, "HE8");
      bloqueioPosVirada.get(1)!.add(m.rowOrd);
      viradasAplicadas.push(`${m.nome} (HE8 dia 01)`);
    }
  }
  if (viradasAplicadas.length) {
    alertas.push({
      tipo: "info",
      msg: `Virada do mês anterior aplicada: ${viradasAplicadas.join(", ")}.`,
    });
  }

  // 1) aplica afastamentos (na linha ORD com a sigla correspondente)
  for (const af of ia.afastamentos) {
    const m = findMilitar(af.matricula, af.nome);
    if (!m) {
      alertas.push({ tipo: "warn", msg: `Afastamento ignorado: militar não encontrado (${af.nome ?? af.matricula})` });
      continue;
    }
    const ini = Math.max(1, Math.min(dias, af.diaInicio));
    const fim = Math.max(ini, Math.min(dias, af.diaFim));
    let sigla = (af.sigla ?? "").toUpperCase().trim();
    if (!SIGLAS_AFASTAMENTO.has(sigla)) {
      // inferir por motivo
      const mot = normNome(af.motivo);
      if (mot.includes("ferias")) sigla = "FER";
      else if (mot.includes("licenca") && mot.includes("saude")) sigla = "LTS";
      else if (mot.includes("gestante")) sigla = "LGE";
      else if (mot.includes("paternidade")) sigla = "LPA";
      else if (mot.includes("luto") || mot.includes("nojo")) sigla = "LNJ";
      else if (mot.includes("curso")) sigla = "CA";
      else if (mot.includes("dispensa")) sigla = "DIS";
      else if (mot.includes("medic")) sigla = "AFM";
      else if (mot.includes("folga")) sigla = "F";
      else sigla = "LTS";
    }
    for (let d = ini; d <= fim; d++) {
      m.afastDias.add(d);
      m.afastSigla.set(d, sigla);
      ord.get(d)!.set(m.rowOrd, sigla);
    }
    // alerta consolidado: um por período (não um por dia)
    const motivoTxt = af.motivo ?? (sigla === "FER" ? "férias" : "afastamento");
    if (ini === fim) {
      alertas.push({ tipo: "info", msg: `${m.nome}: ${sigla} no dia ${ini} (${motivoTxt}).` });
    } else {
      alertas.push({ tipo: "info", msg: `${m.nome}: ${sigla} do dia ${ini} ao dia ${fim} (${motivoTxt}).` });
    }
  }

  // 2) lançamentos diretos (HE/EXP/ORD)
  for (const l of ia.lancamentos) {
    const sigla = l.sigla.toUpperCase().trim();
    const linha: "ORD" | "EXP" | "HE" =
      l.linha ??
      (SIGLAS_HE_VALIDAS.has(sigla) ? "HE" :
       SIGLAS_COMP_VALIDAS.has(sigla) ? "EXP" : "ORD");
    const setDest = linha === "HE" ? he : linha === "EXP" ? expm : ord;
    const validSet = linha === "HE" ? SIGLAS_HE_VALIDAS : linha === "EXP" ? SIGLAS_COMP_VALIDAS : SIGLAS_ORD_VALIDAS;
    if (!validSet.has(sigla)) {
      alertas.push({ tipo: "warn", msg: `Sigla "${sigla}" ignorada (fora do glossário da linha ${linha}).` });
      continue;
    }

    // sem nome → aplicar a todos os militares
    const alvos: MilitarRT[] = l.nome || l.matricula
      ? [findMilitar(l.matricula, l.nome)].filter((x): x is MilitarRT => !!x)
      : militares;
    if ((l.nome || l.matricula) && alvos.length === 0) {
      alertas.push({ tipo: "warn", msg: `Lançamento ignorado: militar não encontrado (${l.nome ?? l.matricula}).` });
      continue;
    }

    for (const d of l.dias) {
      if (d < 1 || d > dias) continue;
      for (const m of alvos) {
        if (m.isAdm && (linha === "EXP" || linha === "HE") && !isDiaExpediente(ano, mes, d)) {
          alertas.push({
            tipo: "warn",
            msg: `Lançamento ${sigla} ignorado para ${m.nome} dia ${d}: ADM não trabalha em fds/feriado.`,
          });
          continue;
        }
        if (linha === "ORD" && (sigla === "2341" || sigla === "1234")) {
          // Serviço 24h SEMPRE em duas células: 234 em D + 1 em D+1
          ord.get(d)!.set(m.rowOrd, "234");
          if (d < dias && !ord.get(d + 1)!.has(m.rowOrd)) ord.get(d + 1)!.set(m.rowOrd, "1");
        } else if (linha === "HE" && (sigla === "HE24" || sigla === "HE23")) {
          // HE 24h SEMPRE em par HE16 + HE8 (regra confirmada pelo usuário)
          he.get(d)!.set(m.rowOrd, "HE16");
          if (d < dias) he.get(d + 1)!.set(m.rowOrd, "HE8");
        } else {
          setDest.get(d)!.set(m.rowOrd, sigla);
        }
      }
    }
    if (!l.__silent) {
      alertas.push({
        tipo: "info",
        msg: `Lançado ${sigla} (${linha}) em ${alvos.length} militar(es) nos dias ${l.dias.join(",")}.`,
      });
    }
  }

  // 3) exceções
  const naoEscalar: Map<number, Set<number>> = new Map();
  const obrigatorio: Map<number, Set<number>> = new Map();
  const apenasFuncao: Map<number, Map<number, "CG" | "COV">> = new Map();
  for (let d = 1; d <= dias; d++) {
    naoEscalar.set(d, new Set());
    obrigatorio.set(d, new Set());
    apenasFuncao.set(d, new Map());
  }
  // mesclar afastamentos (não escalar nos dias de afastamento)
  for (const m of militares) {
    for (const d of m.afastDias) naoEscalar.get(d)?.add(m.rowOrd);
  }
  for (const ex of ia.excecoes) {
    const m = findMilitar(ex.matricula, ex.nome);
    if (!m) continue;
    for (const d of ex.dias) {
      if (d < 1 || d > dias) continue;
      if (ex.acao === "nao_escalar") naoEscalar.get(d)!.add(m.rowOrd);
      else if (ex.acao === "obrigatorio") obrigatorio.get(d)!.add(m.rowOrd);
      else if (ex.acao === "somente_cg") apenasFuncao.get(d)!.set(m.rowOrd, "CG");
      else if (ex.acao === "somente_cov") apenasFuncao.get(d)!.set(m.rowOrd, "COV");
    }
  }

  const reforcoMap = new Map<number, ReforcoIA>();
  for (const r of ia.reforcos) reforcoMap.set(r.dia, r);

  const SIGLA_ORD_DIA = "234";
  const SIGLA_ORD_MADRUGADA = "1";
  const COOLDOWN_DIAS = 2; // 24h trabalho + 12h folga → próxima entrada em D+2

  const inicioServico = new Map<number, Set<number>>();
  for (let d = 1; d <= dias; d++) inicioServico.set(d, new Set());
  const marcaInicioServico = (m: MilitarRT, dia: number) => inicioServico.get(dia)?.add(m.rowOrd);

  // Para cumprir o mínimo diário, conta quem INICIA jornada no dia D — seja ORD,
  // CM+HE ou HE pura. A célula "1" do dia seguinte é só continuação da jornada
  // anterior e não pode abrir vaga extra nem impedir a próxima guarnição de entrar.
  const estaEmServico24 = (m: MilitarRT, dia: number) =>
    inicioServico.get(dia)?.has(m.rowOrd) ||
    ord.get(dia)?.get(m.rowOrd) === SIGLA_ORD_DIA;

  // No último dia do mês, só temos 16h físicas disponíveis (08h–00h);
  // as 8h restantes (00h–08h do dia 1 do mês seguinte) ficam na escala do mês subsequente.
  const horasMaximasNoDia = (dia: number) => (dia === dias ? 18 : 24);

  const siglaOrdPorHoras = (h: number): string | null => {
    if (h >= 18) return "234";
    if (h >= 12) return "23";
    if (h >= 6) return "2";
    return null;
  };

  // Lança uma jornada completa: primeiro consome carga ordinária mensal (ORD+CM)
  // exatamente até o teto do ME; tudo que passar disso vira HE na própria jornada.
  const lancaServico24 = (m: MilitarRT, dia: number, destinoHe = false) => {
    const ultimoDia = dia === dias;
    // Particionamento físico padrão de uma jornada 24h:
    // - Plantão ORD cheio (sigla "234"): 18h dia + 6h madrugada (entrada 18h)
    // - Qualquer jornada que NÃO seja "234" cheio (CM/HE puro ou misto): 16h dia + 8h madrugada
    //   (entrada 08h, saída 00h, plantão noturno entra 00h e devolve às 08h)
    const setHe = (d: number, h: number) => {
      if (h <= 0) return;
      he.get(d)!.set(m.rowOrd, `HE${h}`);
      m.cargaH += h;
    };
    const setCm = (d: number, h: number) => {
      if (h <= 0) return;
      expm.get(d)!.set(m.rowOrd, `CM${h}`);
      m.cargaH += h;
    };

    // Caminho cobertura de furo — partição 16h dia + 8h madrugada (16h só, no último dia).
    // IMPORTANTE: mesmo sendo cobertura, primeiro consome o espaço ORD ainda disponível
    // no mês como CM (complemento), e SÓ o que sobrar vira HE. Isso evita inflar HE
    // quando o militar ainda tinha carga ordinária a fechar (ex.: 16h cobertura, 5h ORD
    // pendentes → CM5 + HE11 em vez de HE16 + CM5 inacessível em outro dia).
    if (destinoHe) {
      const horasDia = 16;
      const horasMadrugada = ultimoDia ? 0 : 8;
      let espacoOrd = Math.max(0, cargaMaxOrd(m) - horasOrdinariasAcumuladas(m));
      let restanteHe = limiteRestanteHe(m);

      // Bloco do dia
      const cmDia = Math.min(horasDia, espacoOrd);
      const heDia = Math.min(horasDia - cmDia, restanteHe);
      setCm(dia, cmDia);
      setHe(dia, heDia);
      espacoOrd -= cmDia;
      restanteHe -= heDia;

      // Bloco da madrugada
      if (!ultimoDia) {
        const cmMad = Math.min(horasMadrugada, espacoOrd);
        const heMad = Math.min(horasMadrugada - cmMad, restanteHe);
        setCm(dia + 1, cmMad);
        setHe(dia + 1, heMad);
      }

      marcaInicioServico(m, dia);
      m.ultimoServico = dia;
      return;
    }

    // Decisão ORD vs HE pela carga mensal
    const tetoOrd = cargaMaxOrd(m);
    const usadoOrd = horasOrdinariasAcumuladas(m);
    const espacoOrd = Math.max(0, tetoOrd - usadoOrd);

    // Saldo ORD < 6h (menos que um turno): NÃO abrir turno ORD.
    // Lança o saldo restante como CM no dia e completa o serviço (16h dia + 8h madrugada) com HE.
    if (espacoOrd > 0 && espacoOrd < 6) {
      const horasDia = 16;
      const horasMadrugada = ultimoDia ? 0 : 8;
      let restanteHe = limiteRestanteHe(m);

      setCm(dia, espacoOrd);
      const heDia = Math.min(horasDia - espacoOrd, restanteHe);
      setHe(dia, heDia);
      restanteHe -= heDia;

      if (!ultimoDia) {
        const heMad = Math.min(horasMadrugada, restanteHe);
        setHe(dia + 1, heMad);
      }

      marcaInicioServico(m, dia);
      m.ultimoServico = dia;
      return;
    }

    // Se cabe um 234 cheio (≥18h ORD disponíveis e não é último dia), usa partição 18+6
    const cabeOrdCheio = !ultimoDia && espacoOrd >= 18;
    const horasDia = cabeOrdCheio ? 18 : 16;
    const horasMadrugada = ultimoDia ? 0 : (cabeOrdCheio ? 6 : 8);
    const horasFisicas = horasDia + horasMadrugada;
    const ordUsar = Math.min(espacoOrd, horasFisicas);

    if (ordUsar <= 0) {
      // Sem espaço ORD → tudo HE, mas respeitando o teto mensal de HE
      const restanteHe = limiteRestanteHe(m);
      const heDia = Math.min(horasDia, restanteHe);
      const heMad = ultimoDia ? 0 : Math.min(horasMadrugada, Math.max(0, restanteHe - heDia));
      setHe(dia, heDia);
      if (!ultimoDia) setHe(dia + 1, heMad);
      marcaInicioServico(m, dia);
      m.ultimoServico = dia;
      return;
    }

    const ordDiaAlvo = Math.min(ordUsar, horasDia);
    const ordDiaTurno = Math.floor(ordDiaAlvo / 6) * 6;
    const ordDiaSigla = siglaOrdPorHoras(ordDiaTurno);
    if (ordDiaSigla) {
      ord.get(dia)!.set(m.rowOrd, ordDiaSigla);
      m.cargaH += ordDiaTurno;
    }
    setCm(dia, ordDiaAlvo - ordDiaTurno);
    setHe(dia, horasDia - ordDiaAlvo);

    if (!ultimoDia) {
      const ordMadAlvo = Math.min(Math.max(0, ordUsar - horasDia), horasMadrugada);
      // Só usa sigla "1" (=6h) se o plantão entrou como 234 cheio E sobrou ORD ≥6 para a madrugada
      if (cabeOrdCheio && ordMadAlvo >= 6) {
        ord.get(dia + 1)!.set(m.rowOrd, SIGLA_ORD_MADRUGADA);
        m.cargaH += 6;
        // horasMadrugada é 6 quando cabeOrdCheio → nada de HE extra
        const heMadExtra = horasMadrugada - 6;
        if (heMadExtra > 0) setHe(dia + 1, heMadExtra);
      } else {
        // Madrugada precisa fechar SEMPRE o bloco físico (horasMadrugada h),
        // independente de quanto ORD residual sobrou — o resto vira HE.
        setCm(dia + 1, ordMadAlvo);
        const heMadFechar = Math.max(0, horasMadrugada - ordMadAlvo);
        if (heMadFechar > 0) {
          const restanteHe = limiteRestanteHe(m);
          setHe(dia + 1, Math.min(heMadFechar, restanteHe));
        }
      }
    }
    marcaInicioServico(m, dia);
    m.ultimoServico = dia;
  };

  for (let dia = 1; dia <= dias; dia++) {
    const slot = ord.get(dia)!; // slot já pode conter lançamentos/afastamentos

    const ref = reforcoMap.get(dia);
    const totalAlvo = ref?.militaresPorDia ?? par.militaresPorDia;
    const minCov = ref?.minCov ?? par.minCovPorDia;
    const minCg = ref?.minCg ?? par.minCgPorDia;

    const indisp = naoEscalar.get(dia)!;
    const apFunc = apenasFuncao.get(dia)!;
    const obriga = obrigatorio.get(dia)!;

    // militares já com lançamento não-ordinário no dia (ex: CM3, HE6 externo) devem contar como ocupados
    const jaOcupado = (m: MilitarRT): boolean => {
      if (slot.has(m.rowOrd)) return true;
      // EXP/HE lançamentos não inviabilizam escala ORD, mas afastamentos sim (já estão em slot)
      return false;
    };

    const elegivel = (m: MilitarRT, papel: "CG" | "COV" | "BM") => {
      if (!m.ativo) return false;
      if (m.isAdm) return false; // ADM nunca entra na escala operacional
      if (m.tipoEscala === "parcial") return false; // parcial não entra em ciclo 24h
      if (indisp.has(m.rowOrd)) return false;
      if (bloqueioPosVirada.get(dia)?.has(m.rowOrd)) return false;
      if (dia < dias && naoEscalar.get(dia + 1)?.has(m.rowOrd)) return false;
      if (jaOcupado(m)) return false;
      if (dia < dias && ord.get(dia + 1)?.has(m.rowOrd)) return false;
      if (m.ultimoServico > 0 && dia - m.ultimoServico < COOLDOWN_DIAS) return false;
      const restr = apFunc.get(m.rowOrd);
      if (restr) {
        if (restr === "CG" && !m.isCg) return false;
        if (restr === "COV" && !m.isCov) return false;
        if (papel !== restr) return false;
      }
      if (papel === "CG" && !m.isCg) return false;
      if (papel === "COV" && !m.isCov) return false;
      return true;
    };

    // Ordem preferencial: militares do grupo da vez (rotação 24x72 por grupo) primeiro,
    // depois o resto por menor carga.
    // Em ciclo 24x72 com 4 grupos, grupo do dia D = ((D-1) mod 4) + 1
    const grupoDoDia = ((dia - 1) % 4) + 1;
    // REGRA RÍGIDA: na escala ORDINÁRIA só entram militares do grupo da vez
    // (ou sem grupo definido — usam rotação por menor carga). Cross-group é
    // proibido aqui — qualquer furo restante será tapado SOMENTE como HE na
    // etapa seguinte. Isto reproduz o comportamento do escalante humano:
    // monta a 24x72 base sem interferência, só depois corrige falhas.
    const escolher = (papel: "CG" | "COV" | "BM"): MilitarRT | null => {
      const noGrupo = militares
        .filter((m) => m.grupoOrdem === grupoDoDia && elegivel(m, papel))
        .sort((a, b) => a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico);
      if (noGrupo[0]) return noGrupo[0];
      // Militares sem grupo definido (config legada): entram por menor carga
      const semGrupo = militares
        .filter((m) => m.grupoOrdem === undefined && elegivel(m, papel))
        .sort((a, b) => a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico);
      return semGrupo[0] ?? null;
      // NÃO há fallback cross-group em ORD: furo vira HE na etapa 4.
    };

    // obrigatórios primeiro
    for (const rowOrd of obriga) {
      const m = militares.find((x) => x.rowOrd === rowOrd);
      if (m && !slot.has(rowOrd) && !m.isAdm) {
        lancaServico24(m, dia);
      }
    }

    // CGs
    let cgEscalados = militares.filter((m) => estaEmServico24(m, dia) && m.isCg).length;
    while (cgEscalados < minCg) {
      const cg = escolher("CG");
      if (!cg) break; // furo será reavaliado depois da etapa de HE
      lancaServico24(cg, dia);
      cgEscalados++;
    }

    // COVs
    let covEscalados = militares.filter((m) => estaEmServico24(m, dia) && m.isCov).length;
    while (covEscalados < minCov) {
      const cov = escolher("COV");
      if (!cov) break;
      lancaServico24(cov, dia);
      covEscalados++;
    }

    // completar
    const escalados24 = () => militares.filter((m) => estaEmServico24(m, dia)).length;
    while (escalados24() < totalAlvo) {
      const m = escolher("BM") ?? escolher("CG") ?? escolher("COV");
      if (!m) break;
      lancaServico24(m, dia);
    }
  }

  /* 4ª ETAPA — Tapar furos com HE: dias em que a ordinária ficou abaixo do alvo
     recebem militares elegíveis (não-ADM, sem indisponibilidade no dia, sem
     ordinária no dia, respeitando cooldown de 12h ≈ 1 dia) lançados como HE24. */
  for (let dia = 1; dia <= dias; dia++) {
    const slotOrd = ord.get(dia)!;
    const slotHe = he.get(dia)!;
    const ref = reforcoMap.get(dia);
    const totalAlvo = ref?.militaresPorDia ?? par.militaresPorDia;
    const minCov = ref?.minCov ?? par.minCovPorDia;
    const minCg = ref?.minCg ?? par.minCgPorDia;

    // conta militares efetivamente em serviço operacional no dia
    const escalados24 = militares.filter((m) => estaEmServico24(m, dia)).length;
    let faltam = totalAlvo - escalados24;
    if (faltam <= 0) continue;

    const indisp = naoEscalar.get(dia)!;
    // MODO ORDINÁRIO PURO: pula tapamento de furos com HE; segue direto pro diagnóstico.
    if (par.modo === "auto") {
    // Candidatos para HE: lançamento é previsão de necessidade de HE.
    // BLOQUEIOS DE FOLGA: HE só vale se o militar estiver realmente livre — sem
    // ORD adjacente (folga 12h pré-plantão D+1 e pós-plantão D-1).
    const candidatos = militares
      .filter((m) => {
        if (!m.ativo) return false;
        if (m.isAdm) return false;
        if (m.tipoEscala === "parcial") return false;
        if (indisp.has(m.rowOrd)) return false;
        if (bloqueioPosVirada.get(dia)?.has(m.rowOrd)) return false;
        if (dia < dias && naoEscalar.get(dia + 1)?.has(m.rowOrd)) return false;
        if (slotOrd.has(m.rowOrd)) return false; // já tem algo na ORD
        if (dia < dias && ord.get(dia + 1)?.has(m.rowOrd)) return false;
        // BLOQUEIO PRÉ-PLANTÃO: se o militar entra de ORD 234 no D+1, não pode HE em D
        if (dia < dias && ord.get(dia + 1)?.get(m.rowOrd) === "234") return false;
        // BLOQUEIO PÓS-PLANTÃO: se o militar saiu de ORD 234 em D-1 (com "1" em D), bloqueia
        if (dia > 1 && ord.get(dia - 1)?.get(m.rowOrd) === "234") return false;
        if (slotHe.has(m.rowOrd)) return false;
        if (dia < dias && he.get(dia + 1)?.has(m.rowOrd)) return false;
        // Respeita teto de HE no mês: bloqueia se já atingiu o limite (sem espaço para 1h sequer)
        if (limiteRestanteHe(m) <= 0) return false;
        return true;
      });

    // Equalização: se algum candidato tem flag `equalizar`, ordena por menor HE no mês.
    // Caso contrário, mantém o ordenamento clássico por menor cargaH.
    const algumEqualizar = candidatos.some((m) => limiteHePorMilitar.get(m.rowOrd)?.equalizar);
    candidatos.sort((a, b) => {
      if (algumEqualizar) {
        const ha = horasHeMes(a), hb = horasHeMes(b);
        if (ha !== hb) return ha - hb;
      }
      return a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico;
    });

    const usadosHe = new Set<number>();
    /**
     * Tenta lançar HE para cobrir 1 vaga do dia. Estratégia:
     * 1) Se cabe HE 24h (HE16+HE8) e o militar não viola descanso → preferido (mantém turno fechado).
     * 2) Senão fragmenta: lança HE de tamanho viável (8h, 12h, 16h, 6h) no próprio dia,
     *    respeitando espaço físico (16h úteis), teto mensal de HE e flag evitarFragmentar.
     * Retorna true se conseguiu lançar (vaga preenchida), false se nada coube.
     */
    const escalaHeCheio = (m: MilitarRT): boolean => {
      const restante = limiteRestanteHe(m);
      const lim = limiteHePorMilitar.get(m.rowOrd);
      // tenta HE 24h fechado primeiro
      if (restante >= 24 && (dia >= dias || !he.get(dia + 1)?.has(m.rowOrd))) {
        lancaServico24(m, dia, true);
        usadosHe.add(m.rowOrd);
        faltam--;
        return true;
      }
      // se proibido fragmentar, desiste deste candidato
      if (lim?.evitarFragmentar) return false;
      // fragmenta no próprio dia respeitando espaço físico
      const espacoFisico = Math.max(0, horasMaximasNoDia(dia) - horasOcupadasNoDia(m, dia));
      const h = Math.min(restante, espacoFisico, horasMaximasNoDia(dia));
      if (h <= 0) return false;
      // arredonda pra blocos típicos (8, 12, 16, 6) — preferindo o maior que couber
      let bloco = h;
      for (const cand of [16, 12, 8, 6]) {
        if (cand <= h) { bloco = cand; break; }
      }
      he.get(dia)!.set(m.rowOrd, `HE${bloco}`);
      m.cargaH += bloco;
      marcaInicioServico(m, dia);
      m.ultimoServico = dia;
      usadosHe.add(m.rowOrd);
      faltam--;
      return true;
    };
    const covAtuais = () => militares.filter((m) => estaEmServico24(m, dia) && m.isCov).length;
    const cgAtuais = () => militares.filter((m) => estaEmServico24(m, dia) && m.isCg).length;

    while (faltam > 0 && cgAtuais() < minCg) {
      const m = candidatos.find((x) => !usadosHe.has(x.rowOrd) && x.isCg);
      if (!m) break;
      if (!escalaHeCheio(m)) usadosHe.add(m.rowOrd); // marca pra não tentar de novo
    }
    while (faltam > 0 && covAtuais() < minCov) {
      const m = candidatos.find((x) => !usadosHe.has(x.rowOrd) && x.isCov);
      if (!m) break;
      if (!escalaHeCheio(m)) usadosHe.add(m.rowOrd);
    }
    for (const m of candidatos) {
      if (faltam <= 0) break;
      if (usadosHe.has(m.rowOrd)) continue;
      escalaHeCheio(m);
    }

    // ===== EXCEÇÃO: efetivo mínimo tem PRIORIDADE ABSOLUTA sobre teto de HE =====
    // Se ainda faltam militares (ou CG/COV) após esgotar candidatos respeitando o
    // limite mensal de HE, fazemos uma 2ª passada IGNORANDO o teto de HE.
    // Prioridade: 1) efetivo mínimo  2) CG  3) COV  4) distribuição  5) limites HE.
    // Cada lançamento como exceção é registrado em `alertas` (tipo info).
    const precisaForcar = () =>
      faltam > 0 || cgAtuais() < minCg || covAtuais() < minCov;

    if (precisaForcar()) {
      const candidatosForcados = militares
        .filter((m) => {
          if (!m.ativo || m.isAdm || m.tipoEscala === "parcial") return false;
          if (indisp.has(m.rowOrd)) return false;
          if (bloqueioPosVirada.get(dia)?.has(m.rowOrd)) return false;
          if (dia < dias && naoEscalar.get(dia + 1)?.has(m.rowOrd)) return false;
          if (slotOrd.has(m.rowOrd)) return false;
          if (dia < dias && ord.get(dia + 1)?.has(m.rowOrd)) return false;
          if (dia < dias && ord.get(dia + 1)?.get(m.rowOrd) === "234") return false;
          if (dia > 1 && ord.get(dia - 1)?.get(m.rowOrd) === "234") return false;
          if (slotHe.has(m.rowOrd)) return false;
          if (dia < dias && he.get(dia + 1)?.has(m.rowOrd)) return false;
          if (usadosHe.has(m.rowOrd)) return false;
          // ÚNICA diferença: NÃO checa limiteRestanteHe — efetivo mínimo > teto HE.
          return true;
        })
        .sort((a, b) => {
          // prioriza quem tem MAIOR teto restante (menos exceção) e menor carga
          const ra = limiteRestanteHe(a);
          const rb = limiteRestanteHe(b);
          if (ra !== rb) return rb - ra;
          return a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico;
        });

      const forcar = (m: MilitarRT) => {
        // lança HE24 ignorando teto, registra exceção
        const heAntes = horasHeMes(m);
        // emula escalaHeCheio mas sem limites
        if (dia >= dias || !he.get(dia + 1)?.has(m.rowOrd)) {
          lancaServico24(m, dia, true);
        } else {
          // sem espaço pra 24h — fragmenta no dia
          const espacoFisico = Math.max(0, horasMaximasNoDia(dia) - horasOcupadasNoDia(m, dia));
          const h = Math.min(espacoFisico, horasMaximasNoDia(dia));
          if (h <= 0) return false;
          let bloco = h;
          for (const cand of [16, 12, 8, 6]) { if (cand <= h) { bloco = cand; break; } }
          he.get(dia)!.set(m.rowOrd, `HE${bloco}`);
          m.cargaH += bloco;
          marcaInicioServico(m, dia);
          m.ultimoServico = dia;
        }
        usadosHe.add(m.rowOrd);
        faltam--;
        const lim = limiteHePorMilitar.get(m.rowOrd);
        const teto = lim?.max ?? Infinity;
        if (Number.isFinite(teto)) {
          alertas.push({
            tipo: "info",
            msg: `Dia ${dia}: ${m.nome} escalado como EXCEÇÃO ao limite de HE (já tinha ${heAntes}h, teto ${teto}h) para garantir efetivo mínimo de ${totalAlvo} militares.`,
          });
        }
        return true;
      };

      // 1º CG, 2º COV, 3º preencher total
      while (precisaForcar() && cgAtuais() < minCg) {
        const m = candidatosForcados.find((x) => !usadosHe.has(x.rowOrd) && x.isCg);
        if (!m) break;
        if (!forcar(m)) usadosHe.add(m.rowOrd);
      }
      while (precisaForcar() && covAtuais() < minCov) {
        const m = candidatosForcados.find((x) => !usadosHe.has(x.rowOrd) && x.isCov);
        if (!m) break;
        if (!forcar(m)) usadosHe.add(m.rowOrd);
      }
      for (const m of candidatosForcados) {
        if (faltam <= 0) break;
        if (usadosHe.has(m.rowOrd)) continue;
        forcar(m);
      }
    }
    } // fim if (par.modo === "auto") — ordinário puro pula HE-filling

    // Helpers para o diagnóstico (independente de modo).
    const cgAtuais = () => militares.filter((m) => estaEmServico24(m, dia) && m.isCg).length;
    const covAtuais = () => militares.filter((m) => estaEmServico24(m, dia) && m.isCov).length;
    const escalados24 = militares.filter((m) => estaEmServico24(m, dia)).length;
    const faltam = Math.max(0, totalAlvo - escalados24);

    // Diagnóstico: se ainda falta gente após esgotar candidatos, explica o porquê
    // ao usuário. Conta os motivos pelos quais militares operacionais ficaram de
    // fora para que o alerta seja acionável (ex: "todos os CG atingiram o teto
    // de 24h de HE configurado nas observações").
    const cgFalta = Math.max(0, minCg - cgAtuais());
    const covFalta = Math.max(0, minCov - covAtuais());
    const efetivoFalta = faltam;
    if (efetivoFalta > 0 || cgFalta > 0 || covFalta > 0) {
      // recontagem de motivos sobre o universo operacional (não-ADM, não-parcial, ativo)
      const universo = militares.filter(
        (m) => m.ativo && !m.isAdm && m.tipoEscala !== "parcial",
      );
      const motivos = {
        afastado: 0,
        ordNoDia: 0,
        descansoPosPlantao: 0,
        descansoPrePlantao: 0,
        jaTemHe: 0,
        tetoHeAtingido: 0,
      };
      const tetoHeMilitares: string[] = [];
      for (const m of universo) {
        if (estaEmServico24(m, dia)) continue; // já está cobrindo
        const indispDia = indisp.has(m.rowOrd);
        const posVir = bloqueioPosVirada.get(dia)?.has(m.rowOrd) ?? false;
        const ordHoje = slotOrd.has(m.rowOrd);
        const ordAmanha = dia < dias && ord.get(dia + 1)?.has(m.rowOrd);
        const heAmanha = dia < dias && he.get(dia + 1)?.has(m.rowOrd);
        const heHoje = slotHe.has(m.rowOrd);
        const tetoHe = limiteRestanteHe(m) <= 0;
        if (indispDia) motivos.afastado++;
        else if (ordHoje) motivos.ordNoDia++;
        else if (posVir || (dia > 1 && ord.get(dia - 1)?.get(m.rowOrd) === "234"))
          motivos.descansoPosPlantao++;
        else if (ordAmanha || (dia < dias && ord.get(dia + 1)?.get(m.rowOrd) === "234"))
          motivos.descansoPrePlantao++;
        else if (heHoje || heAmanha) motivos.jaTemHe++;
        else if (tetoHe) {
          motivos.tetoHeAtingido++;
          tetoHeMilitares.push(m.nome);
        }
      }

      const detalhes: string[] = [];
      if (motivos.tetoHeAtingido > 0) {
        detalhes.push(
          `${motivos.tetoHeAtingido} militar(es) já atingiram o teto de HE configurado` +
            (tetoHeMilitares.length <= 4
              ? ` (${tetoHeMilitares.join(", ")})`
              : ""),
        );
      }
      if (motivos.afastado > 0) detalhes.push(`${motivos.afastado} afastado(s)`);
      if (motivos.descansoPosPlantao > 0)
        detalhes.push(`${motivos.descansoPosPlantao} em descanso pós-plantão`);
      if (motivos.descansoPrePlantao > 0)
        detalhes.push(`${motivos.descansoPrePlantao} bloqueado(s) por plantão no dia seguinte`);
      if (motivos.jaTemHe > 0) detalhes.push(`${motivos.jaTemHe} já com HE no dia/véspera`);
      if (motivos.ordNoDia > 0) detalhes.push(`${motivos.ordNoDia} já em ORD no dia`);

      const partes: string[] = [];
      if (cgFalta > 0) partes.push(`${cgFalta} CG`);
      if (covFalta > 0) partes.push(`${covFalta} COV`);
      if (efetivoFalta > 0 && partes.length === 0) partes.push(`${efetivoFalta} militar(es)`);

      const motivoTxt = detalhes.length > 0
        ? ` Motivo: ${detalhes.join("; ")}.`
        : " Não há candidatos disponíveis no efetivo.";

      alertas.push({
        tipo: "warn",
        msg: `Dia ${dia}: guarnição mínima incompleta — falta ${partes.join(" e ")}.${motivoTxt}`,
      });
    }
  }

  /* 5ª ETAPA — Acerto de carga horária mensal.
     Para cada militar ativo (não-ADM): se a soma de horas ORD ficou
     abaixo da carga mínima do mês, lança CM (complemento) na linha EXP
     do último serviço; se ultrapassou, converte o excedente em HE. */

  // (cargaBase, ORD_HORAS, horasOrdSigla, horasOrdAcumuladas e cargaMaxOrd já
  //  declarados antes da etapa 3 — necessários no momento da escolha do plantão.)
  const horasOrdMes = horasOrdinariasAcumuladas;

  // Dias afastados por militar (qualquer sigla de afastamento conta para reduzir carga)
  const diasAfastadoMap = new Map<number, number>();
  for (const m of militares) {
    let count = 0;
    for (let d = 1; d <= dias; d++) {
      const s = ord.get(d)?.get(m.rowOrd);
      if (s && SIGLAS_AFASTAMENTO.has(s)) count++;
    }
    diasAfastadoMap.set(m.rowOrd, count);
  }

  // Encontra dia do último serviço 24h ORD do militar (sigla "234")
  const ultimoServico24 = (m: MilitarRT): number | null => {
    for (let d = dias; d >= 1; d--) {
      if (ord.get(d)?.get(m.rowOrd) === "234") return d;
    }
    return null;
  };

  // Verifica se militar está livre num dia para receber HE/CM avulso
  // (sem ORD operacional, sem afastamento, sem HE já lançado, sem indisponibilidade)
  const diaLivreParaLancamento = (m: MilitarRT, d: number): boolean => {
    const sOrd = ord.get(d)?.get(m.rowOrd);
    if (sOrd) return false; // qualquer ORD bloqueia (serviço, afastamento, parcial)
    if (he.get(d)?.has(m.rowOrd)) return false;
    if (naoEscalar.get(d)?.has(m.rowOrd)) return false;
    if (bloqueioPosVirada.get(d)?.has(m.rowOrd)) return false;
    return true;
  };

  const acertosCm: string[] = [];
  const acertosHe: string[] = [];
  const cmAvulso: string[] = [];

  /**
   * Espaço útil restante no dia para receber CM/EXP/HE complementar.
   * - Limite operacional: 16h úteis por dia (regra de exemplo: ORD 23 + CM4 fecha 16h).
   * - No último dia do mês, mantém o mesmo teto.
   * - Se o militar já tem plantão 24h no dia, retorna 0.
   */
  const espacoLivreNoDia = (m: MilitarRT, d: number): number => {
    const ocup = horasOcupadasNoDia(m, d);
    if (ocup >= 16) return 0;
    return 16 - ocup;
  };

  const acertosExpAdm: string[] = [];

  for (const m of militares) {
    if (!m.ativo) continue;

    // ===== ADM: completar carga horária mensal aumentando EXP em dias úteis =====
    if (m.isAdm) {
      const diasAfAdm = diasAfastadoMap.get(m.rowOrd) ?? 0;
      const alvoAdm = cargaMensalProporcional(diasAfAdm);
      if (alvoAdm <= 0) continue;
      let totalExp = 0;
      for (let d = 1; d <= dias; d++) totalExp += horasExpDia(m, d);
      let faltamAdm = alvoAdm - totalExp;
      if (faltamAdm <= 0) continue;
      // 1ª passada: aumentar siglas EXP existentes até 12h por dia
      for (let d = 1; d <= dias && faltamAdm > 0; d++) {
        if (!isDiaExpediente(ano, mes, d)) continue;
        if (naoEscalar.get(d)?.has(m.rowOrd)) continue;
        if (ord.get(d)?.has(m.rowOrd)) continue; // afastamento
        const sAtual = expm.get(d)?.get(m.rowOrd);
        if (!sAtual) continue;
        const hAtual = horasExpSigla(sAtual);
        const tipo = /^(EXP|CM|TELE)/i.exec(sAtual)?.[1].toUpperCase() ?? "EXP";
        const espacoLivre = 12 - hAtual;
        if (espacoLivre <= 0) continue;
        const add = Math.min(faltamAdm, espacoLivre);
        expm.get(d)!.set(m.rowOrd, `${tipo}${hAtual + add}`);
        faltamAdm -= add;
      }
      // 2ª passada: lançar EXP novo em dias úteis ainda vazios
      for (let d = 1; d <= dias && faltamAdm > 0; d++) {
        if (!isDiaExpediente(ano, mes, d)) continue;
        if (naoEscalar.get(d)?.has(m.rowOrd)) continue;
        if (ord.get(d)?.has(m.rowOrd)) continue;
        if (expm.get(d)?.has(m.rowOrd)) continue;
        const add = Math.min(faltamAdm, 12);
        expm.get(d)!.set(m.rowOrd, `EXP${add}`);
        faltamAdm -= add;
      }
      const fechado = (alvoAdm - totalExp) - faltamAdm;
      if (fechado > 0) acertosExpAdm.push(`${m.nome} (+${fechado}h EXP)`);
      if (faltamAdm > 0) acertosExpAdm.push(`${m.nome} (faltam ${faltamAdm}h — sem dia útil livre)`);
      continue;
    }

    const diasAf = diasAfastadoMap.get(m.rowOrd) ?? 0;
    const cargaMin = cargaMensalProporcional(diasAf);
    if (cargaMin <= 0) continue;
    const cargaOrd = horasOrdMes(m);

    if (cargaOrd === cargaMin) continue;

    if (cargaOrd > cargaMin) {
      // Defensivo: a etapa 3 (lancaServico24) agora trava o crescimento de ORD
      // no teto da carga mensal, lançando HE automaticamente quando o plantão
      // estouraria. Se mesmo assim sobrou excedente (ex.: lançamentos manuais
      // de ORD via observações ou exceção `obrigatorio`), apenas registra alerta
      // — NÃO converte em HE colado em dia aleatório, pra não criar a "HE fantasma".
      const excedente = cargaOrd - cargaMin;
      acertosHe.push(`${m.nome} (+${excedente}h ORD acima da carga mensal — verifique lançamentos manuais)`);
    } else {
      // FALTANTE → CM puro em dias úteis livres até bater cargaMin. ZERO HE.
      // O plantão 234 (D) + 1 (D+1) já fecha 24h físicas — não tocamos no dia do plantão
      // para não criar jornadas de 30h nem inflar a carga mensal (AK em vermelho).
      let faltam = cargaMin - cargaOrd;
      const totalFaltam = faltam;

      // Lança CM avulso em dias úteis livres, respeitando o limite físico do dia
      // (espacoLivreNoDia já desconta plantões e afastamentos).
      while (faltam > 0) {
        let lancou = false;
        for (let d = 1; d <= dias; d++) {
          if (!isDiaExpediente(ano, mes, d)) continue;
          if (!diaLivreParaLancamento(m, d)) continue;
          if (expm.get(d)?.has(m.rowOrd)) continue;
          const espaco = espacoLivreNoDia(m, d);
          if (espaco <= 0) continue;
          const cm = Math.min(faltam, 16, espaco);
          if (cm <= 0) continue;
          expm.get(d)!.set(m.rowOrd, `CM${cm}`);
          faltam -= cm;
          lancou = true;
          break;
        }
        if (!lancou) break;
      }

      const fechou = totalFaltam - faltam;
      if (fechou > 0) acertosCm.push(`${m.nome} (${fechou}h CM)`);
      if (faltam > 0) acertosCm.push(`${m.nome} (faltam ${faltam}h — sem dia livre p/ CM)`);
    }
  }

  if (acertosCm.length) {
    alertas.push({
      tipo: "info",
      msg: `Complemento de carga (CM) lançado: ${acertosCm.join(", ")}.`,
    });
  }
  if (cmAvulso.length) {
    alertas.push({
      tipo: "info",
      msg: `Complemento avulso (sem serviço 24h restante): ${cmAvulso.join(", ")}.`,
    });
  }
  if (acertosHe.length) {
    alertas.push({
      tipo: "warn",
      msg: `Atenção — carga ORD acima da prevista (provável lançamento manual): ${acertosHe.join(", ")}.`,
    });
  }
  if (acertosExpAdm.length) {
    alertas.push({
      tipo: "info",
      msg: `Expediente complementar (ADM): ${acertosExpAdm.join(", ")}.`,
    });
  }

  /* 6ª ETAPA — Sanidade final: nenhuma combinação ORD+EXP+HE pode passar de
     24h físicas no mesmo dia. Se encontrar, ajusta primeiro EXP/CM/TELE para
     baixo, depois HE. Emite alerta para cada correção. */
  const correcoes: string[] = [];
  for (const m of militares) {
    for (let d = 1; d <= dias; d++) {
      const ocup = horasOcupadasNoDia(m, d);
      if (ocup <= 24) continue;
      let excesso = ocup - 24;
      // 1) reduz EXP/CM/TELE
      const sExp = expm.get(d)?.get(m.rowOrd);
      if (sExp && excesso > 0) {
        const hExp = horasExpSigla(sExp);
        const tipo = /^(EXP|CM|TELE)/i.exec(sExp)?.[1].toUpperCase() ?? "EXP";
        const cortar = Math.min(excesso, hExp);
        const novo = hExp - cortar;
        if (novo > 0) expm.get(d)!.set(m.rowOrd, `${tipo}${novo}`);
        else expm.get(d)!.delete(m.rowOrd);
        excesso -= cortar;
        correcoes.push(`${m.nome} dia ${d}: ${sExp}→${novo > 0 ? `${tipo}${novo}` : "vazio"} (excesso ${cortar}h)`);
      }
      // 2) reduz HE se ainda sobra
      const sHe = he.get(d)?.get(m.rowOrd);
      if (sHe && excesso > 0) {
        const hHe = horasHeSigla(sHe);
        const cortar = Math.min(excesso, hHe);
        const novo = hHe - cortar;
        if (novo > 0) he.get(d)!.set(m.rowOrd, `HE${novo}`);
        else he.get(d)!.delete(m.rowOrd);
        excesso -= cortar;
        correcoes.push(`${m.nome} dia ${d}: ${sHe}→${novo > 0 ? `HE${novo}` : "vazio"} (excesso ${cortar}h)`);
      }
    }
  }
  if (correcoes.length) {
    alertas.push({
      tipo: "warn",
      msg: `Combinações que passariam de 24h no mesmo dia foram ajustadas automaticamente: ${correcoes.join("; ")}.`,
    });
  }

  /* 6.5ª ETAPA — ADM nunca tem EXP/HE em sábado, domingo ou feriado.
     Defesa em profundidade contra lançamentos manuais da IA, feriados
     estaduais ausentes da lista nacional e resíduos do XML original. */
  const saneadosAdm: string[] = [];
  for (const m of militares) {
    if (!m.isAdm) continue;
    for (let d = 1; d <= dias; d++) {
      if (isDiaExpediente(ano, mes, d)) continue;
      const sExp = expm.get(d)?.get(m.rowOrd);
      if (sExp) {
        expm.get(d)!.delete(m.rowOrd);
        saneadosAdm.push(`${m.nome} dia ${d}: EXP ${sExp} removido`);
      }
      const sHe = he.get(d)?.get(m.rowOrd);
      if (sHe) {
        he.get(d)!.delete(m.rowOrd);
        saneadosAdm.push(`${m.nome} dia ${d}: HE ${sHe} removido`);
      }
    }
  }
  if (saneadosAdm.length) {
    alertas.push({
      tipo: "info",
      msg: `ADM saneado (sem EXP/HE em fds/feriado): ${saneadosAdm.join("; ")}.`,
    });
  }

  /* 7ª ETAPA — Validação final: furos de guarnição e conflitos de descanso. */
  const furos: string[] = [];
  const conflitosDescanso: string[] = [];
  for (let dia = 1; dia <= dias; dia++) {
    const ref = reforcoMap.get(dia);
    const totalAlvo = ref?.militaresPorDia ?? par.militaresPorDia;
    const minCov = ref?.minCov ?? par.minCovPorDia;
    const minCg = ref?.minCg ?? par.minCgPorDia;

    // Conta somente jornadas iniciadas no dia; madrugada/HE8 do plantão anterior não abre vaga nova.
    const cobertos = militares.filter((m) => estaEmServico24(m, dia));
    const cgs = cobertos.filter((m) => m.isCg).length;
    const covs = cobertos.filter((m) => m.isCov).length;

    if (cobertos.length < totalAlvo) {
      furos.push(`dia ${dia}: ${cobertos.length}/${totalAlvo} militares`);
    }
    if (cgs < minCg) furos.push(`dia ${dia}: ${cgs}/${minCg} CG`);
    if (covs < minCov) furos.push(`dia ${dia}: ${covs}/${minCov} COV`);
  }
  if (furos.length) {
    alertas.push({
      tipo: "error",
      msg: `Furos de guarnição (sem efetivo disponível): ${furos.slice(0, 20).join("; ")}${furos.length > 20 ? "..." : ""}.`,
    });
  }

  // Revalidação de descanso: militar não pode ter ORD/HE em 2 dias consecutivos
  // (folga mínima 12h após plantão de 24h).
  for (const m of militares) {
    if (!m.ativo || m.isAdm || m.tipoEscala === "parcial") continue;
    for (let d = 1; d < dias; d++) {
      const hojeAtivo = estaEmServico24(m, d);
      if (!hojeAtivo) continue;
      const amanhaAtivo = estaEmServico24(m, d + 1);
      if (amanhaAtivo) {
        conflitosDescanso.push(`${m.nome} (dias ${d}→${d + 1})`);
      }
    }
  }
  if (conflitosDescanso.length) {
    alertas.push({
      tipo: "warn",
      msg: `Possíveis violações de descanso (12h): ${conflitosDescanso.slice(0, 15).join(", ")}${conflitosDescanso.length > 15 ? "..." : ""}.`,
    });
  }

  return { ord, exp: expm, he };
}



/* ------------------------------------------------------------------ */
/* Server function                                                    */
/* ------------------------------------------------------------------ */

export const gerarEscala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
   try {
    const { supabase, userId } = context;
    const alertas: Alerta[] = [];

    /* 1) Carregar workbook como ZIP (preserva 100% do arquivo original) */
    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    if (bin.byteLength > 8_000_000) throw new Error("Arquivo muito grande (máximo 8 MB).");
    let bundle;
    try {
      bundle = loadXlsx(bin);
    } catch (e) {
      throw new Error("Não foi possível ler o arquivo XLSX: " + (e instanceof Error ? e.message : ""));
    }

    /* 2) Localizar abas — Anexo B (escrita) e Efetivo (somente leitura) */
    let anexoSheet: { path: string; xml: string } | null = null;
    let efetivoSheet: { path: string; xml: string } | null = null;
    for (const [name, path] of bundle.sheetByName.entries()) {
      if (!anexoSheet && name.includes("anexo b")) {
        anexoSheet = { path, xml: "" };
      } else if (!efetivoSheet && name === "efetivo") {
        efetivoSheet = { path, xml: "" };
      }
    }
    if (!anexoSheet) throw new Error('Arquivo não possui aba "Anexo B - Escala".');
    if (!efetivoSheet) throw new Error('Arquivo não possui aba "Efetivo".');
    anexoSheet = getSheetXml(bundle, "anexo b");
    efetivoSheet = getSheetXml(bundle, "efetivo");

    /* 3) Ler Efetivo — B=id func, C=nome, D=posto.
       MAPEAMENTO RÍGIDO: cada militar é uma linha consecutiva da aba Efetivo,
       e ocupa 3 linhas FIXAS na aba Anexo B (ORD, EXP, HE). NÃO pular linhas
       automaticamente. Primeira linha vazia encerra a leitura; qualquer linha
       com dados após ela é erro fatal de mapeamento. */
    const efetivoRows: { idFunc: string; nome: string; postoGrad: string }[] = [];
    const efRows = iterRows(efetivoSheet.xml);
    const maxEfRow = efRows.length ? Math.max(...efRows.map((r) => r.r)) : 100;
    let leituraEncerrada = false;
    for (let r = 2; r <= maxEfRow; r++) {
      const idFunc = readCell(bundle, efetivoSheet.xml, makeRef(r, 2));
      const nomeStr = readCell(bundle, efetivoSheet.xml, makeRef(r, 3));
      const posto = readCell(bundle, efetivoSheet.xml, makeRef(r, 4));
      const vazia = !nomeStr.trim() && !idFunc.trim();
      if (vazia) {
        leituraEncerrada = true;
        continue;
      }
      if (leituraEncerrada) {
        throw new Error(
          `Erro de mapeamento de militar detectado. Linha ${r} da aba Efetivo possui dados após uma linha vazia. ` +
          `Cada militar deve ocupar exatamente 3 linhas consecutivas (ORD/EFE, EXP/COM, HE) sem buracos. ` +
          `Corrija a planilha removendo a linha vazia ou os dados órfãos.`
        );
      }
      if (!nomeStr.trim()) {
        throw new Error(
          `Erro de mapeamento de militar detectado. Linha ${r} da aba Efetivo tem matrícula mas nome vazio.`
        );
      }
      efetivoRows.push({
        idFunc: normMatricula(idFunc),
        nome: nomeStr,
        postoGrad: posto,
      });
    }
    if (efetivoRows.length === 0) throw new Error("Aba Efetivo está vazia.");

    /* 4) Militares cadastrados do usuário (com flags multi-papel) */
    const { data: cadastrados, error: errCad } = await supabase
      .from("militares")
      .select("id, matricula_norm, nome, is_cov, is_cg, is_adm, ativo, tipo_escala")
      .eq("user_id", userId)
      .eq("ativo", true);
    if (errCad) throw new Error("Falha ao ler militares: " + errCad.message);

    interface CadInfo {
      id: string;
      nome: string;
      isCov: boolean;
      isCg: boolean;
      isAdm: boolean;
      tipoEscala: "24h" | "parcial";
    }
    const cadPorMat = new Map<string, CadInfo>();
    const cadPorNome = new Map<string, CadInfo>();
    for (const c of cadastrados ?? []) {
      const tipo = (c as { tipo_escala?: string }).tipo_escala === "parcial" ? "parcial" : "24h";
      const info: CadInfo = {
        id: c.id as string,
        nome: c.nome as string,
        isCov: !!c.is_cov,
        isCg: !!c.is_cg,
        isAdm: !!c.is_adm,
        tipoEscala: tipo,
      };
      const mn = (c.matricula_norm as string | null) ?? "";
      if (mn) cadPorMat.set(mn, info);
      cadPorNome.set(normNome(c.nome as string), info);
    }

    /* 4.1) Férias automáticas do ano alvo */
    const { data: feriasRows } = await supabase
      .from("ferias_militares")
      .select("militar_id, data_inicio, data_fim")
      .eq("user_id", userId)
      .eq("ano", data.ano);

    const feriasPorMilitar = new Map<string, { inicio: string; fim: string }[]>();
    for (const f of feriasRows ?? []) {
      const arr = feriasPorMilitar.get(f.militar_id as string) ?? [];
      arr.push({ inicio: f.data_inicio as string, fim: f.data_fim as string });
      feriasPorMilitar.set(f.militar_id as string, arr);
    }

    /* 4.2) Escalas ordinárias (grupos de rotação) */
    const { data: escOrdRows } = await supabase
      .from("escalas_ordinarias")
      .select("id, ordem")
      .eq("user_id", userId)
      .eq("mes", data.mes)
      .eq("ano", data.ano);

    const ordemPorEscala = new Map<string, number>();
    for (const e of escOrdRows ?? []) ordemPorEscala.set(e.id as string, e.ordem as number);

    const grupoPorMilitar = new Map<string, number>();
    if (ordemPorEscala.size) {
      const { data: membros } = await supabase
        .from("escala_ordinaria_membros")
        .select("escala_id, militar_id")
        .eq("user_id", userId)
        .in("escala_id", Array.from(ordemPorEscala.keys()));
      for (const m of membros ?? []) {
        const ord = ordemPorEscala.get(m.escala_id as string);
        if (ord) grupoPorMilitar.set(m.militar_id as string, ord);
      }
    }

    /* 5) Runtime dos militares — linhas R12, R15, R18... */
    const naoCadastrados: string[] = [];
    const militares: MilitarRT[] = efetivoRows.map((ef, i) => {
      const rowOrd = 12 + i * 3;
      const cad = cadPorMat.get(ef.idFunc) ?? cadPorNome.get(normNome(ef.nome));
      const isCov = !!cad?.isCov;
      const isCg = !!cad?.isCg;
      const isAdm = !!cad?.isAdm;
      if (!cad) {
        naoCadastrados.push(`${ef.nome}${ef.idFunc ? ` (${ef.idFunc})` : ""}`);
      }
      const m: MilitarRT = {
        rowOrd,
        nome: ef.nome,
        nomeNorm: normNome(ef.nome),
        matricula: ef.idFunc,
        posto: ef.postoGrad ?? "",
        postoCat: classificarPosto(ef.postoGrad ?? ""),
        isCov, isCg, isAdm,
        // militar não cadastrado: existe na planilha (preserva layout) mas não recebe lançamentos automáticos
        ativo: !!cad,
        cargaH: 0,
        ultimoServico: 0,
        afastDias: new Set(),
        afastSigla: new Map(),
        grupoOrdem: cad ? grupoPorMilitar.get(cad.id) : undefined,
        tipoEscala: cad?.tipoEscala ?? "24h",
      };
      // pré-aplica férias do plano anual (sem alerta aqui — será consolidado na seção 6.1)
      if (cad) {
        const periodos = feriasPorMilitar.get(cad.id) ?? [];
        for (const p of periodos) {
          const ini = new Date(p.inicio);
          const fim = new Date(p.fim);
          for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
            if (d.getUTCFullYear() === data.ano && d.getUTCMonth() + 1 === data.mes) {
              const dia = d.getUTCDate();
              m.afastDias.add(dia);
              m.afastSigla.set(dia, "FER");
            }
          }
        }
      }
      return m;
    });

    if (naoCadastrados.length) {
      alertas.push({
        tipo: "info",
        msg: `${naoCadastrados.length} militar(es) da planilha não estão cadastrados e foram ignorados: ${naoCadastrados.join(", ")}.`,
      });
    }

    /* 6) IA interpretando observações */
    const ia = await interpretarObservacoes(
      data.parametros.observacoesTexto,
      militares.map((m) => ({ nome: m.nome, matricula: m.matricula })),
      data.mes, data.ano,
    );

    /* 6.0) Virada do mês anterior selecionada explicitamente na UI tem prioridade
            sobre qualquer inferência da IA — evita duplicidade e garante 8h. */
    if (data.viradaAnterior?.length) {
      const idToCad = new Map<string, CadInfo>();
      for (const c of cadastrados ?? []) idToCad.set(c.id as string, {
        id: c.id as string,
        nome: c.nome as string,
        isCov: !!c.is_cov,
        isCg: !!c.is_cg,
        isAdm: !!c.is_adm,
        tipoEscala: ((c as { tipo_escala?: string }).tipo_escala === "parcial" ? "parcial" : "24h"),
      });
      const matsExplicitas = new Set<string>();
      for (const v of data.viradaAnterior) {
        const cad = idToCad.get(v.militarId);
        if (!cad) continue;
        // localizar matrícula no efetivo (via cadPorNome)
        const m = militares.find((x) => normNome(x.nome) === normNome(cad.nome));
        if (!m) continue;
        matsExplicitas.add(m.matricula || m.nomeNorm);
        // remove duplicatas vindas da IA p/ esse militar
        ia.viradaAnterior = (ia.viradaAnterior ?? []).filter((iv) => {
          const im = militares.find((x) => (iv.matricula && normMatricula(iv.matricula) === x.matricula) || (iv.nome && normNome(iv.nome) === x.nomeNorm));
          return im?.rowOrd !== m.rowOrd;
        });
        ia.viradaAnterior.push({ matricula: m.matricula, nome: m.nome, tipo: v.tipo });
      }
    }

    /* 6.1) Pré-aplicar afastamentos do plano anual agrupando dias contíguos por sigla
            (gera 1 ia.afastamento por período → 1 alerta consolidado). */
    for (const m of militares) {
      const diasOrdenados = Array.from(m.afastSigla.keys()).sort((a, b) => a - b);
      let i = 0;
      while (i < diasOrdenados.length) {
        const sigla = m.afastSigla.get(diasOrdenados[i])!;
        let j = i;
        while (
          j + 1 < diasOrdenados.length &&
          diasOrdenados[j + 1] === diasOrdenados[j] + 1 &&
          m.afastSigla.get(diasOrdenados[j + 1]) === sigla
        ) {
          j++;
        }
        ia.afastamentos.push({
          matricula: m.matricula,
          nome: m.nome,
          diaInicio: diasOrdenados[i],
          diaFim: diasOrdenados[j],
          sigla,
          motivo: sigla === "FER" ? "férias (plano anual)" : sigla,
        });
        i = j + 1;
      }
      // limpa para não duplicar dentro do motor
      m.afastDias = new Set();
      m.afastSigla = new Map();
    }

    /* 6.2) ETAPA 2 — Aplicar expediente ADM (EXP9 seg-qui, EXP6 sex) na linha EXP.
            Lançado direto via ia.lancamentos para garantir que o motor não conflite. */
    {
      const dias = diasNoMes(data.mes, data.ano);
      const expPorDia = new Map<number, string>(); // dia -> EXP9 ou EXP6
      for (let d = 1; d <= dias; d++) {
        if (!isDiaExpediente(data.ano, data.mes, d)) continue;
        const dow = new Date(Date.UTC(data.ano, data.mes - 1, d)).getUTCDay(); // 1=seg..5=sex
        if (dow >= 1 && dow <= 4) expPorDia.set(d, "EXP9");
        else if (dow === 5) expPorDia.set(d, "EXP6");
      }
      const admMilitares = militares.filter((m) => m.isAdm);
      for (const m of admMilitares) {
        // dias em que o militar ADM tem afastamento (já em ia.afastamentos)
        const diasAfastado = new Set<number>();
        for (const af of ia.afastamentos) {
          if (af.matricula === m.matricula || normNome(af.nome) === m.nomeNorm) {
            for (let d = af.diaInicio; d <= af.diaFim; d++) diasAfastado.add(d);
          }
        }
        for (const [dia, sigla] of expPorDia.entries()) {
          if (diasAfastado.has(dia)) continue;
          ia.lancamentos.push({
            matricula: m.matricula,
            nome: m.nome,
            dias: [dia],
            linha: "EXP",
            sigla,
            __silent: true,
          });
        }
      }
      if (admMilitares.length) {
        alertas.push({
          tipo: "info",
          msg: `Expediente lançado para: ${admMilitares.map((m) => m.nome).join(", ")} (EXP9 seg-qui, EXP6 sex; sem fins de semana/feriados).`,
        });
      }
    }


    /* 7) Motor */
    const dias = diasNoMes(data.mes, data.ano);
    const { ord, exp: expm, he } = escalar(militares, dias, data.mes, data.ano, data.parametros, ia, alertas);

    /* 8) Acumular edições para a aba Anexo B (cirúrgico — não toca em
          estilos, validações, fórmulas das demais células). */
    const COL_INI = 6; // F
    const DIAS_MAX_PLANILHA = 31;
    const edits: CellEdit[] = [];

    // Cabeçalho do mês (A8)
    edits.push({
      ref: makeRef(8, 1),
      value: `MAPA DE ESCALA DE SERVIÇO EXECUTADO  - REFERENTE AO MÊS  DE ${NOMES_MES[data.mes - 1].toUpperCase()} DE   ${data.ano}`,
    });

    // Linhas 10 (dias) e 11 (rótulo da semana)
    for (let d = 1; d <= DIAS_MAX_PLANILHA; d++) {
      const col = COL_INI + (d - 1);
      if (d <= dias) {
        edits.push({ ref: makeRef(10, col), value: String(d) });
        edits.push({ ref: makeRef(11, col), value: rotuloSemana(data.ano, data.mes, d) });
      } else {
        edits.push({ ref: makeRef(10, col), value: "" });
        edits.push({ ref: makeRef(11, col), value: "" });
      }
    }

    // Limpar células de dia dos blocos de cada militar (mantém estilo herdado)
    let escritas = 0;
    for (const m of militares) {
      for (let offset = 0; offset <= 2; offset++) {
        for (let d = 1; d <= DIAS_MAX_PLANILHA; d++) {
          edits.push({ ref: makeRef(m.rowOrd + offset, COL_INI + (d - 1)), value: "" });
        }
      }
    }

    const setSigla = (dia: number, rowOrd: number, linhaOffset: number, sigla: string) => {
      edits.push({ ref: makeRef(rowOrd + linhaOffset, COL_INI + (dia - 1)), value: sigla });
      escritas++;
    };

    for (const [dia, slot] of ord.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) setSigla(dia, rowOrd, 0, sigla);
    }
    for (const [dia, slot] of expm.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) setSigla(dia, rowOrd, 1, sigla);
    }
    for (const [dia, slot] of he.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) setSigla(dia, rowOrd, 2, sigla);
    }

    /* 9) Aplicar edições e serializar preservando layout original */
    const skippedFormulas: string[] = [];
    const newAnexoXml = applyEdits(anexoSheet.xml, edits, skippedFormulas);
    if (skippedFormulas.length) {
      alertas.push({
        tipo: "warn",
        msg: `${skippedFormulas.length} célula(s) com fórmula preservada(s) (não sobrescrita): ${skippedFormulas.slice(0, 12).join(", ")}${skippedFormulas.length > 12 ? "..." : ""}.`,
      });
    }
    writeSheetXml(bundle, anexoSheet.path, newAnexoXml);
    const outBytes = saveXlsx(bundle);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${userId}/${data.ano}-${String(data.mes).padStart(2, "0")}-${ts}.xlsx`;

    const { error: upErr } = await supabase.storage
      .from("escalas")
      .upload(path, outBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (upErr) throw new Error("Falha ao salvar arquivo: " + upErr.message);

    const insertPayload = {
      user_id: userId,
      mes: data.mes,
      ano: data.ano,
      arquivo_nome: data.fileName,
      diretrizes: data.parametros.observacoesTexto || null,
      observacoes_texto: data.parametros.observacoesTexto || null,
      parametros: data.parametros,
      arquivo_saida_path: path,
      status: "concluida",
      alertas,
      exportacoes: [],
    };
    const { data: row, error: insErr } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (p: unknown) => {
          select: (s: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from("escalas_geradas")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr) throw new Error("Falha ao registrar histórico: " + insErr.message);

    const { data: signed } = await supabase.storage
      .from("escalas")
      .createSignedUrl(path, 60 * 60);

    return {
      ok: true,
      escalaId: row?.id,
      downloadUrl: signed?.signedUrl ?? null,
      escritas,
      alertas,
      iaResumo: {
        afastamentos: ia.afastamentos.length,
        lancamentos: ia.lancamentos.length,
        reforcos: ia.reforcos.length,
        excecoes: ia.excecoes.length,
      },
      militaresProcessados: militares.length,
    };
   } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[gerarEscala] erro no handler:", msg, err);
      throw new Error(msg);
   }
  });
