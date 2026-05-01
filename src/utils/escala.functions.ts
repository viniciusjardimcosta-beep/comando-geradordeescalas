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
});

const InputSchema = z.object({
  fileBase64: z.string().min(100),
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

6) limitesHe: tetos de HE no mês e regras de equalização.
   - "limitar HE dos sargentos a 24h cada, equalizado" → { postoOuPapel: "sgt", maxHoras: 24, equalizar: true }
   - "equalizar HE dos soldados sem fragmentar muito" → { postoOuPapel: "sd", maxHoras: 999, equalizar: true, evitarFragmentar: true }
   - "Sgt X no máximo 12h de HE no mês" → { nome: "X", maxHoras: 12 }
   - postoOuPapel aceita: "sgt", "sd", "cb", "ten", "all". Use "all" para todos.
   - equalizar=true → motor distribui HE preferindo quem tem MENOS HE no mês.
   - evitarFragmentar=true → motor prefere lançar HE em blocos de 24h (HE16+HE8) e evita HE6/HE8 isolados.

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


  // Militares que fizeram serviço/HE 24h em D31 do mês passado recebem no dia 01:
  //   - tipo "ord" → ORD=1 (madrugada) + EXP=CM2 (00h-02h). +8h carga. Bloqueia ORD dias 1 e 2.
  //   - tipo "he"  → HE=HE8. Bloqueia ORD no dia 1.
  const bloqueioPosVirada = new Map<number, Set<number>>();
  for (let d = 1; d <= dias; d++) bloqueioPosVirada.set(d, new Set());
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
  const SIGLA_HE_DIA = "HE16";       // regra: HE 24h sempre em par HE16+HE8
  const SIGLA_HE_MADRUGADA = "HE8";
  const COOLDOWN_DIAS = 2; // 24h trabalho + 12h folga → próxima entrada em D+2

  const estaEmServico24 = (m: MilitarRT, dia: number) =>
    ord.get(dia)?.get(m.rowOrd) === SIGLA_ORD_DIA ||
    (dia < dias && ord.get(dia + 1)?.get(m.rowOrd) === SIGLA_ORD_MADRUGADA);

  // No último dia do mês, só temos 16h físicas disponíveis (08h–00h);
  // as 8h restantes (00h–08h do dia 1 do mês seguinte) ficam na escala do mês subsequente.
  const horasMaximasNoDia = (dia: number) => (dia === dias ? 16 : 24);

  const lancaServico24 = (m: MilitarRT, dia: number, destinoHe = false) => {
    const ultimoDia = dia === dias;
    if (destinoHe) {
      // No último dia, no máximo HE16 (sem extensão para D+1, que seria do próximo mês)
      if (ultimoDia) {
        he.get(dia)!.set(m.rowOrd, "HE16");
        m.cargaH += 16;
      } else {
        he.get(dia)!.set(m.rowOrd, SIGLA_HE_DIA);
        he.get(dia + 1)!.set(m.rowOrd, SIGLA_HE_MADRUGADA);
        m.cargaH += 24;
      }
    } else {
      if (ultimoDia) {
        // Último dia: serviço operacional só até 02h (sigla "234" = 18h, sem "1" no mês seguinte)
        ord.get(dia)!.set(m.rowOrd, "234");
        m.cargaH += 18;
      } else {
        ord.get(dia)!.set(m.rowOrd, SIGLA_ORD_DIA);
        if (!ord.get(dia + 1)!.has(m.rowOrd)) {
          ord.get(dia + 1)!.set(m.rowOrd, SIGLA_ORD_MADRUGADA);
        }
        m.cargaH += 24;
      }
    }
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
    const escolher = (papel: "CG" | "COV" | "BM"): MilitarRT | null => {
      const candidatos = militares
        .filter((m) => m.grupoOrdem === grupoDoDia && elegivel(m, papel))
        .sort((a, b) => {
          return a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico;
        });
      return candidatos[0] ?? null;
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
    // Candidatos para HE: lançamento é previsão de necessidade de HE,
    // por isso NÃO aplicamos cooldown de folga aqui (apenas afastamento e conflito de ORD/HE).
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
        if (slotHe.has(m.rowOrd)) return false;
        if (dia < dias && he.get(dia + 1)?.has(m.rowOrd)) return false;
        return true;
      })
      .sort((a, b) => a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico);

    const usadosHe = new Set<number>();
    const escalaHe = (m: MilitarRT) => {
      lancaServico24(m, dia, true);
      usadosHe.add(m.rowOrd);
      faltam--;
    };
    const covAtuais = () => militares.filter((m) => (estaEmServico24(m, dia) || slotHe.has(m.rowOrd)) && m.isCov).length;
    const cgAtuais = () => militares.filter((m) => (estaEmServico24(m, dia) || slotHe.has(m.rowOrd)) && m.isCg).length;

    while (faltam > 0 && cgAtuais() < minCg) {
      const m = candidatos.find((x) => !usadosHe.has(x.rowOrd) && x.isCg);
      if (!m) break;
      escalaHe(m);
    }
    while (faltam > 0 && covAtuais() < minCov) {
      const m = candidatos.find((x) => !usadosHe.has(x.rowOrd) && x.isCov);
      if (!m) break;
      escalaHe(m);
    }
    for (const m of candidatos) {
      if (faltam <= 0) break;
      if (usadosHe.has(m.rowOrd)) continue;
      escalaHe(m);
    }
    // Sem warn quando não há candidato — o lançamento de HE é apenas previsão
    // de necessidade da guarnição mínima, não uma falha de geração.
  }

  /* 5ª ETAPA — Acerto de carga horária mensal.
     Para cada militar ativo (não-ADM): se a soma de horas ORD ficou
     abaixo da carga mínima do mês, lança CM (complemento) na linha EXP
     do último serviço; se ultrapassou, converte o excedente em HE. */

  // Carga mínima base por dias do mês (espelha as fórmulas da planilha)
  const cargaBase = (d: number): number =>
    ({ 28: 160, 29: 165, 30: 171, 31: 177 } as Record<number, number>)[d] ?? 177;

  // Tamanho em horas de cada sigla ORD parcial (já suportadas pela planilha)
  const ORD_HORAS: Record<string, number> = {
    "2": 6, "3": 6, "4": 6, "1": 6,
    "23": 12, "34": 12, "234": 18, "2341": 24, "234 1": 24,
  };
  const horasOrdSigla = (s: string): number => ORD_HORAS[s] ?? 0;

  // Total de horas ordinárias no mês para o militar (somando sigla do dia + sigla do D+1 se for "1" da virada)
  const horasOrdMes = (m: MilitarRT): number => {
    let total = 0;
    for (let d = 1; d <= dias; d++) {
      const s = ord.get(d)?.get(m.rowOrd);
      if (!s) continue;
      // sigla "1" no D+1 é apenas extensão visual da madrugada do serviço iniciado em D-1;
      // não soma horas (o serviço completo de 24h já é contado em "234"/"2341" do dia D).
      if (s === "1") continue;
      // "234" representa serviço 24h (08h-08h) iniciado naquele dia → 24h.
      // "2341" também = 24h. Demais parciais conforme tabela.
      if (s === "234" || s === "2341" || s === "234 1") {
        total += 24;
        continue;
      }
      total += horasOrdSigla(s);
    }
    return total;
  };

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

  // Helper: extrai horas de uma sigla EXP/CM/TELE (formato LETRAS+NÚMERO)
  const horasExpSigla = (s: string): number => {
    const mt = /^(?:EXP|CM|TELE)(\d{1,2})$/i.exec(s.trim());
    return mt ? Number(mt[1]) : 0;
  };
  const horasExpDia = (m: MilitarRT, d: number): number => {
    const s = expm.get(d)?.get(m.rowOrd);
    return s ? horasExpSigla(s) : 0;
  };

  const acertosExpAdm: string[] = [];

  for (const m of militares) {
    if (!m.ativo) continue;

    // ===== ADM: completar carga horária mensal aumentando EXP em dias úteis =====
    if (m.isAdm) {
      const diasAfAdm = diasAfastadoMap.get(m.rowOrd) ?? 0;
      const alvoAdm = Math.round(cargaBase(dias) * (1 - diasAfAdm / dias));
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
    const cargaMin = Math.round(cargaBase(dias) * (1 - diasAf / dias));
    if (cargaMin <= 0) continue;
    const cargaOrd = horasOrdMes(m);

    if (cargaOrd === cargaMin) continue;

    if (cargaOrd > cargaMin) {
      // EXCEDENTE → manter serviços 24h intactos; distribuir excedente como HE
      // em dias livres do militar (respeitando 16h máx no último dia do mês).
      let restante = cargaOrd - cargaMin;
      const inicio = cargaOrd - cargaMin; // total para reportar
      for (let d = 1; d <= dias && restante > 0; d++) {
        if (!diaLivreParaLancamento(m, d)) continue;
        const max = horasMaximasNoDia(d);
        const h = Math.min(restante, max);
        if (h <= 0) continue;
        he.get(d)!.set(m.rowOrd, `HE${h}`);
        restante -= h;
      }
      const lancado = inicio - restante;
      if (lancado > 0) acertosHe.push(`${m.nome} (${lancado}h excedente)`);
      // se sobrou (sem dias livres), não emite warn — é só previsão
    } else {
      // FALTANTE → CM puro até bater cargaMin. ZERO HE.
      let faltam = cargaMin - cargaOrd;
      const totalFaltam = faltam;
      const dia = ultimoServico24(m);

      // 1) Se há serviço 24h restante: troca "234"+"1" por (24-faltam)h ORD parcial + CM(faltam)
      //    no mesmo plantão físico — o resto do tempo do plantão fica como descanso (sem HE).
      if (dia !== null && faltam <= 24) {
        const cm = Math.min(faltam, 16);
        const horasOrdManter = 24 - cm;
        let novaSigla = "";
        let horasOrdReais = 0;
        if (horasOrdManter >= 18) { novaSigla = "234"; horasOrdReais = 18; }
        else if (horasOrdManter >= 12) { novaSigla = "23"; horasOrdReais = 12; }
        else if (horasOrdManter >= 6) { novaSigla = "2"; horasOrdReais = 6; }
        // recalcula CM exato para fechar (24-horasOrdReais) horas, mas no máx CM16 e máx faltam
        const cmFinal = Math.min(16, faltam, 24 - horasOrdReais);
        if (cmFinal > 0) {
          ord.get(dia)!.delete(m.rowOrd);
          if (dia < dias) ord.get(dia + 1)!.delete(m.rowOrd);
          if (novaSigla) ord.get(dia)!.set(m.rowOrd, novaSigla);
          expm.get(dia)!.set(m.rowOrd, `CM${cmFinal}`);
          // ajuste de horas: tirou 24h ORD, colocou (horasOrdReais + cmFinal)h
          faltam -= cmFinal;
          // se ainda sobra carga, vamos para CM avulso abaixo
        }
      }

      // 2) Resto (ou tudo, se não tinha serviço 24h) → CM avulso em dias úteis livres
      while (faltam > 0) {
        let lancou = false;
        for (let d = 1; d <= dias; d++) {
          if (!isDiaExpediente(ano, mes, d)) continue;
          if (!diaLivreParaLancamento(m, d)) continue;
          if (expm.get(d)?.has(m.rowOrd)) continue;
          const cm = Math.min(faltam, 16);
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
      tipo: "info",
      msg: `Excedente convertido em HE: ${acertosHe.join(", ")}.`,
    });
  }
  if (acertosExpAdm.length) {
    alertas.push({
      tipo: "info",
      msg: `Expediente complementar (ADM): ${acertosExpAdm.join(", ")}.`,
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

    /* 3) Ler Efetivo — B=id func, C=nome, D=posto */
    const efetivoRows: { idFunc: string; nome: string; postoGrad: string }[] = [];
    const efRows = iterRows(efetivoSheet.xml);
    const maxEfRow = efRows.length ? Math.max(...efRows.map((r) => r.r)) : 100;
    for (let r = 2; r <= maxEfRow; r++) {
      const idFunc = readCell(bundle, efetivoSheet.xml, makeRef(r, 2));
      const nomeStr = readCell(bundle, efetivoSheet.xml, makeRef(r, 3));
      const posto = readCell(bundle, efetivoSheet.xml, makeRef(r, 4));
      if (!nomeStr.trim()) continue;
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
    const newAnexoXml = applyEdits(anexoSheet.xml, edits);
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
