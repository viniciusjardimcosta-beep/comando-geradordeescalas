import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import ExcelJS from "exceljs";

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
interface InterpretacaoIA {
  afastamentos: AfastamentoIA[];
  reforcos: ReforcoIA[];
  excecoes: ExcecaoIA[];
  lancamentos: LancamentoIA[];
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
  const vazia: InterpretacaoIA = { afastamentos: [], reforcos: [], excecoes: [], lancamentos: [] };
  if (!apiKey || !texto.trim()) return vazia;

  const efetivoCompacto = efetivo
    .slice(0, 200)
    .map((m) => `${m.matricula}|${m.nome}`)
    .join("\n");

  const sys = `Você é um interpretador de observações de escala militar (BM).
Mês alvo: ${NOMES_MES[mes - 1]}/${ano}.

Converta o texto do usuário em JSON estruturado com 4 seções:

1) afastamentos: períodos em que militar NÃO entra na escala ordinária.
   - motivos comuns → sigla a lançar na célula do dia (linha ORD):
     férias=FER, licença tratamento saúde=LTS, LP=LP, licença gestante=LGE, licença paternidade=LPA,
     licença adoção=LAD, dispensa=DIS, curso=CA, folga=F, RDC=RDC, afastamento médico=AFM,
     luto=LNJ, atestado curto=FE, licença alun/aluno=LAA, etc.
   - Se o usuário disser só "férias", use "FER". Se falar só "licença" sem detalhar, use "LTS".

2) lancamentos: comandos diretos de sigla em dias específicos, em linhas específicas:
   - linha "HE" (hora extra) → siglas HE1..HE24
   - linha "EXP" (expediente/compensação) → siglas EXP1..EXP12, CM1..CM16, TELE1..TELE8
   - linha "ORD" (padrão) → siglas numéricas (2341, 1234, 123, 12, 1, 2, 3, 4, etc), C1..C4, OS, CV1..CV12, SSxx
   - Ex.: "dia 04 lançar HE2 para todos" → lancamentos com sigla=HE2, linha=HE, dias=[4] (sem nome = todos).
   - Ex.: "Sgt X CM3 dia 10" → sigla=CM3, linha=EXP, dias=[10], nome=X.

3) reforcos: alterar a quantidade padrão de militares/COV/CG em dias específicos.

4) excecoes: regras pontuais (nao_escalar, somente_cg, somente_cov, obrigatorio).

Identifique militares por matrícula quando possível; senão por nome.
Dias sem mês explícito são do mês corrente. Sempre devolva inteiros 1-31.
Se a observação não pedir nada que caiba numa seção, deixe array vazio.`;

  const tools = [{
    type: "function",
    function: {
      name: "interpretar_observacoes",
      description: "Estrutura observações em afastamentos, lançamentos, reforços e exceções.",
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
        },
        required: ["afastamentos", "lancamentos", "reforcos", "excecoes"],
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
}

function escalar(
  militares: MilitarRT[],
  dias: number,
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
    alertas.push({ tipo: "info", msg: `${m.nome}: ${sigla} do dia ${ini} ao ${fim} (${af.motivo ?? "afastamento"})` });
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
        setDest.get(d)!.set(m.rowOrd, sigla);
      }
    }
    alertas.push({
      tipo: "info",
      msg: `Lançado ${sigla} (${linha}) em ${alvos.length} militar(es) nos dias ${l.dias.join(",")}.`,
    });
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

  const SIGLA_24 = "2341";
  const COOLDOWN_DIAS = 2; // 24h trabalho + 12h folga → próxima entrada em D+2

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
      if (indisp.has(m.rowOrd)) return false;
      if (jaOcupado(m)) return false;
      if (m.ultimoServico > 0 && dia - m.ultimoServico < COOLDOWN_DIAS) return false;
      const restr = apFunc.get(m.rowOrd);
      if (restr && papel !== restr) return false;
      if (papel === "CG" && m.funcao !== "CG") return false;
      if (papel === "COV" && m.funcao !== "COV") return false;
      return true;
    };

    const escolher = (papel: "CG" | "COV" | "BM"): MilitarRT | null => {
      const candidatos = militares
        .filter((m) => elegivel(m, papel))
        .sort((a, b) => a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico);
      return candidatos[0] ?? null;
    };

    // obrigatórios primeiro
    for (const rowOrd of obriga) {
      const m = militares.find((x) => x.rowOrd === rowOrd);
      if (m && !slot.has(rowOrd)) {
        slot.set(rowOrd, SIGLA_24);
        m.cargaH += 24;
        m.ultimoServico = dia;
      }
    }

    // CGs
    let cgEscalados = militares.filter((m) => slot.get(m.rowOrd) === SIGLA_24 && m.funcao === "CG").length;
    while (cgEscalados < minCg) {
      const cg = escolher("CG");
      if (!cg) {
        alertas.push({ tipo: "warn", msg: `Dia ${dia}: faltou CG (mínimo ${minCg}).` });
        break;
      }
      slot.set(cg.rowOrd, SIGLA_24);
      cg.cargaH += 24;
      cg.ultimoServico = dia;
      cgEscalados++;
    }

    // COVs
    let covEscalados = militares.filter((m) => slot.get(m.rowOrd) === SIGLA_24 && m.funcao === "COV").length;
    while (covEscalados < minCov) {
      const cov = escolher("COV");
      if (!cov) {
        alertas.push({ tipo: "warn", msg: `Dia ${dia}: faltou COV (mínimo ${minCov}).` });
        break;
      }
      slot.set(cov.rowOrd, SIGLA_24);
      cov.cargaH += 24;
      cov.ultimoServico = dia;
      covEscalados++;
    }

    // completar
    const escalados24 = () => militares.filter((m) => slot.get(m.rowOrd) === SIGLA_24).length;
    while (escalados24() < totalAlvo) {
      let m = escolher("BM") ?? escolher("CG") ?? escolher("COV");
      if (!m) {
        const flex = militares
          .filter((x) => x.ativo && !indisp.has(x.rowOrd) && !slot.has(x.rowOrd))
          .sort((a, b) => a.cargaH - b.cargaH);
        m = flex[0] ?? null;
        if (m) alertas.push({
          tipo: "warn",
          msg: `Dia ${dia}: 24x72 quebrado para ${m.nome} por falta de efetivo.`,
        });
      }
      if (!m) {
        alertas.push({ tipo: "error", msg: `Dia ${dia}: efetivo insuficiente.` });
        break;
      }
      slot.set(m.rowOrd, SIGLA_24);
      m.cargaH += 24;
      m.ultimoServico = dia;
    }
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
    const { supabase, userId } = context;
    const alertas: Alerta[] = [];

    /* 1) Carregar workbook com ExcelJS (preserva estilos/merges/fórmulas) */
    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bin.buffer as ArrayBuffer);
    } catch (e) {
      throw new Error("Não foi possível ler o arquivo XLSX: " + (e instanceof Error ? e.message : ""));
    }

    /* 2) Localizar abas */
    let wsAnexo: ExcelJS.Worksheet | undefined;
    let wsEfetivo: ExcelJS.Worksheet | undefined;
    wb.eachSheet((ws) => {
      const n = ws.name.trim().toLowerCase();
      if (n.includes("anexo b")) wsAnexo = ws;
      else if (n === "efetivo") wsEfetivo = ws;
    });
    if (!wsAnexo) throw new Error('Arquivo não possui aba "Anexo B - Escala".');
    if (!wsEfetivo) throw new Error('Arquivo não possui aba "Efetivo".');

    /* 3) Ler Efetivo — B=id func, C=nome, D=posto */
    const efetivoRows: { idFunc: string; nome: string; postoGrad: string }[] = [];
    const maxEfRow = wsEfetivo.rowCount || 100;
    for (let r = 2; r <= maxEfRow; r++) {
      const idFunc = wsEfetivo.getCell(r, 2).value;
      const nomeCell = wsEfetivo.getCell(r, 3).value;
      const posto = wsEfetivo.getCell(r, 4).value;
      const nomeStr =
        typeof nomeCell === "string" ? nomeCell :
        nomeCell && typeof nomeCell === "object" && "result" in nomeCell ? String(nomeCell.result ?? "") :
        nomeCell && typeof nomeCell === "object" && "richText" in nomeCell ? (nomeCell.richText as { text: string }[]).map(t => t.text).join("") :
        String(nomeCell ?? "");
      if (!nomeStr.trim()) continue;
      efetivoRows.push({
        idFunc: normMatricula(idFunc),
        nome: nomeStr,
        postoGrad: String(posto ?? ""),
      });
    }
    if (efetivoRows.length === 0) throw new Error("Aba Efetivo está vazia.");

    /* 4) Militares cadastrados do usuário */
    const { data: cadastrados, error: errCad } = await supabase
      .from("militares")
      .select("matricula_norm, nome, funcao, ativo")
      .eq("user_id", userId)
      .eq("ativo", true);
    if (errCad) throw new Error("Falha ao ler militares: " + errCad.message);

    const cadPorMat = new Map<string, { funcao: "COV" | "CG"; nome: string }>();
    const cadPorNome = new Map<string, { funcao: "COV" | "CG"; nome: string }>();
    for (const c of cadastrados ?? []) {
      const mn = c.matricula_norm ?? "";
      if (mn) cadPorMat.set(mn, { funcao: c.funcao as "COV" | "CG", nome: c.nome });
      cadPorNome.set(normNome(c.nome), { funcao: c.funcao as "COV" | "CG", nome: c.nome });
    }

    /* 5) Runtime dos militares — linhas R12, R15, R18... */
    const militares: MilitarRT[] = efetivoRows.map((ef, i) => {
      const rowOrd = 12 + i * 3;
      const cad = cadPorMat.get(ef.idFunc) ?? cadPorNome.get(normNome(ef.nome));
      const funcao: "COV" | "CG" | "BM" = cad?.funcao ?? "BM";
      if (!cad) {
        alertas.push({
          tipo: "info",
          msg: `${ef.nome} (${ef.idFunc || "sem matrícula"}) não está no cadastro — tratado como BM comum.`,
        });
      }
      return {
        rowOrd,
        nome: ef.nome,
        nomeNorm: normNome(ef.nome),
        matricula: ef.idFunc,
        funcao,
        ativo: true,
        cargaH: 0,
        ultimoServico: 0,
        afastDias: new Set(),
        afastSigla: new Map(),
      };
    });

    /* 6) IA interpretando observações */
    const ia = await interpretarObservacoes(
      data.parametros.observacoesTexto,
      militares.map((m) => ({ nome: m.nome, matricula: m.matricula })),
      data.mes, data.ano,
    );

    /* 7) Motor */
    const dias = diasNoMes(data.mes, data.ano);
    const { ord, exp: expm, he } = escalar(militares, dias, data.parametros, ia, alertas);

    /* 8) Escrever SOMENTE nas células de dia (F=6 até F+dias-1).
          NÃO tocar em colunas A-E, linhas 10-11, nem em outras abas.
          Preservamos estilo da célula (usamos só .value). */
    const COL_INI = 6; // F
    let escritas = 0;
    const escreve = (dia: number, rowOrd: number, linhaOffset: number, sigla: string) => {
      const cell = wsAnexo!.getCell(rowOrd + linhaOffset, COL_INI + (dia - 1));
      cell.value = sigla;
      // força string para evitar que "1234" vire número
      cell.numFmt = "@";
      escritas++;
    };

    for (const [dia, slot] of ord.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) escreve(dia, rowOrd, 0, sigla);
    }
    for (const [dia, slot] of expm.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) escreve(dia, rowOrd, 1, sigla);
    }
    for (const [dia, slot] of he.entries()) {
      for (const [rowOrd, sigla] of slot.entries()) escreve(dia, rowOrd, 2, sigla);
    }

    /* 9) Serializar preservando layout original */
    const outBuf = await wb.xlsx.writeBuffer();
    const outBytes = new Uint8Array(outBuf as ArrayBuffer);
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
  });
