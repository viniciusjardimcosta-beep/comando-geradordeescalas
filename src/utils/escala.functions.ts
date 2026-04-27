import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as XLSX from "xlsx";

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
});

type Alerta = { tipo: "info" | "warn" | "error"; msg: string };

interface AfastamentoIA {
  matricula?: string;
  nome?: string;
  diaInicio: number;
  diaFim: number;
  motivo?: string;
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
function colLetter(idx0: number): string {
  // 0->A, 25->Z, 26->AA ...
  let n = idx0;
  let s = "";
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
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
  const vazia: InterpretacaoIA = { afastamentos: [], reforcos: [], excecoes: [] };
  if (!apiKey || !texto.trim()) return vazia;

  const efetivoCompacto = efetivo
    .slice(0, 200)
    .map((m) => `${m.matricula}|${m.nome}`)
    .join("\n");

  const sys = `Você é um interpretador de observações de escala militar.
A escala é do mês ${NOMES_MES[mes - 1]}/${ano}.
Receba instruções em texto livre e converta em JSON com:
- afastamentos: períodos em que um militar NÃO pode ser escalado (ferias, licença, dispensa, curso, atestado).
- reforcos: dias com necessidade diferente da padrão (ex: mais militares, mais COV, mais CG).
- excecoes: regras pontuais por militar (não escalar, somente CG, somente COV, obrigatório).
Identifique militares por matrícula quando possível. Se só houver nome, use nome.
Datas sem mês são do mês corrente. Sempre devolva números de dia inteiros (1-31).`;

  const tools = [{
    type: "function",
    function: {
      name: "interpretar_observacoes",
      description: "Estrutura observações de escala em afastamentos, reforços e exceções.",
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
              },
              required: ["diaInicio", "diaFim"],
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
        required: ["afastamentos", "reforcos", "excecoes"],
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
    const parsed = JSON.parse(args) as InterpretacaoIA;
    return {
      afastamentos: Array.isArray(parsed.afastamentos) ? parsed.afastamentos : [],
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
  rowOrd: number; // linha 1-indexed da linha ORD
  nome: string;
  nomeNorm: string;
  matricula: string;
  funcao: "COV" | "CG" | "BM"; // BM = soldado/praça comum (pode ser escalado em qualquer slot)
  ativo: boolean;
  cargaH: number;
  ultimoServico: number; // dia do último serviço (0 = nenhum)
}

function escalar(
  militares: MilitarRT[],
  dias: number,
  par: z.infer<typeof ParametrosSchema>,
  ia: InterpretacaoIA,
  alertas: Alerta[],
): Map<number, Map<number, string>> {
  // mapa dia -> (rowOrd -> sigla)
  const out = new Map<number, Map<number, string>>();

  // monta indisponibilidades por dia (Set<rowOrd>)
  const indispPorDia: Map<number, Set<number>> = new Map();
  for (let d = 1; d <= dias; d++) indispPorDia.set(d, new Set());

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

  // aplica afastamentos
  for (const af of ia.afastamentos) {
    const m = findMilitar(af.matricula, af.nome);
    if (!m) {
      alertas.push({ tipo: "warn", msg: `Afastamento ignorado: militar não encontrado (${af.nome ?? af.matricula})` });
      continue;
    }
    const ini = Math.max(1, Math.min(dias, af.diaInicio));
    const fim = Math.max(ini, Math.min(dias, af.diaFim));
    for (let d = ini; d <= fim; d++) indispPorDia.get(d)!.add(m.rowOrd);
    alertas.push({ tipo: "info", msg: `${m.nome}: indisponível ${ini}-${fim} (${af.motivo ?? "afastamento"})` });
  }

  // exceções
  const naoEscalar: Map<number, Set<number>> = indispPorDia;
  const obrigatorio: Map<number, Set<number>> = new Map();
  const apenasFuncao: Map<number, Map<number, "CG" | "COV">> = new Map();
  for (let d = 1; d <= dias; d++) {
    obrigatorio.set(d, new Set());
    apenasFuncao.set(d, new Map());
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

  // reforcos por dia
  const reforcoMap = new Map<number, ReforcoIA>();
  for (const r of ia.reforcos) reforcoMap.set(r.dia, r);

  const SIGLA = "2341"; // 24h padrão (turno 2->3->4->1)
  const FOLGA_MIN = 12; // h
  // 24h trabalhado + 12h folga = pode voltar 36h depois (=> dia + 2)
  const COOLDOWN_DIAS = 2;

  for (let dia = 1; dia <= dias; dia++) {
    const slot = out.get(dia) ?? new Map<number, string>();
    out.set(dia, slot);

    const ref = reforcoMap.get(dia);
    const totalAlvo = ref?.militaresPorDia ?? par.militaresPorDia;
    const minCov = ref?.minCov ?? par.minCovPorDia;
    const minCg = ref?.minCg ?? par.minCgPorDia;

    const indisp = naoEscalar.get(dia)!;
    const apFunc = apenasFuncao.get(dia)!;
    const obriga = obrigatorio.get(dia)!;

    const elegivel = (m: MilitarRT, papel: "CG" | "COV" | "BM") => {
      if (!m.ativo) return false;
      if (indisp.has(m.rowOrd)) return false;
      if (m.ultimoServico > 0 && dia - m.ultimoServico < COOLDOWN_DIAS) return false;
      const restr = apFunc.get(m.rowOrd);
      if (restr && papel !== restr) return false;
      if (papel === "CG" && m.funcao !== "CG") return false;
      if (papel === "COV" && m.funcao !== "COV") return false;
      return true;
    };

    const escolher = (papel: "CG" | "COV" | "BM"): MilitarRT | null => {
      const candidatos = militares
        .filter((m) => elegivel(m, papel) && !slot.has(m.rowOrd))
        .sort((a, b) => a.cargaH - b.cargaH || a.ultimoServico - b.ultimoServico);
      return candidatos[0] ?? null;
    };

    // 1) escalar obrigatórios (ignora cooldown)
    for (const rowOrd of obriga) {
      const m = militares.find((x) => x.rowOrd === rowOrd);
      if (m && !slot.has(rowOrd)) {
        slot.set(rowOrd, SIGLA);
        m.cargaH += 24;
        m.ultimoServico = dia;
      }
    }

    // 2) CGs
    let cgEscalados = militares.filter((m) => slot.has(m.rowOrd) && m.funcao === "CG").length;
    while (cgEscalados < minCg) {
      const cg = escolher("CG");
      if (!cg) {
        alertas.push({ tipo: "warn", msg: `Dia ${dia}: faltou CG (mínimo ${minCg}).` });
        break;
      }
      slot.set(cg.rowOrd, SIGLA);
      cg.cargaH += 24;
      cg.ultimoServico = dia;
      cgEscalados++;
    }

    // 3) COVs
    let covEscalados = militares.filter((m) => slot.has(m.rowOrd) && m.funcao === "COV").length;
    while (covEscalados < minCov) {
      const cov = escolher("COV");
      if (!cov) {
        alertas.push({ tipo: "warn", msg: `Dia ${dia}: faltou COV (mínimo ${minCov}).` });
        break;
      }
      slot.set(cov.rowOrd, SIGLA);
      cov.cargaH += 24;
      cov.ultimoServico = dia;
      covEscalados++;
    }

    // 4) preencher restantes
    while (slot.size < totalAlvo) {
      let m = escolher("BM") ?? escolher("CG") ?? escolher("COV");
      if (!m) {
        // afrouxar cooldown se realmente faltar gente (quebra do 24x72 permitida)
        const flex = militares
          .filter((x) => x.ativo && !indisp.has(x.rowOrd) && !slot.has(x.rowOrd))
          .sort((a, b) => a.cargaH - b.cargaH);
        m = flex[0] ?? null;
        if (m) alertas.push({
          tipo: "warn",
          msg: `Dia ${dia}: 24x72 quebrado para ${m.nome} (folga<36h) por falta de efetivo.`,
        });
      }
      if (!m) {
        alertas.push({ tipo: "error", msg: `Dia ${dia}: efetivo insuficiente. Faltam ${totalAlvo - slot.size}.` });
        break;
      }
      slot.set(m.rowOrd, SIGLA);
      m.cargaH += 24;
      m.ultimoServico = dia;
    }
  }

  return out;
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

    /* 1) Decode planilha */
    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(bin, { type: "array", cellFormula: true, cellStyles: true });
    } catch (e) {
      throw new Error("Não foi possível ler o arquivo XLSX.");
    }

    /* 2) Localizar aba ANEXO B */
    const sheetAnexoB = wb.SheetNames.find(
      (n) => n.trim().toLowerCase().includes("anexo b"),
    );
    if (!sheetAnexoB) {
      throw new Error('Arquivo não possui aba "Anexo B - Escala". Geração impedida.');
    }
    const ws = wb.Sheets[sheetAnexoB];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:BH711");

    /* 3) Ler aba Efetivo */
    const sheetEfetivo = wb.SheetNames.find((n) => n.trim().toLowerCase() === "efetivo");
    if (!sheetEfetivo) throw new Error('Arquivo não possui aba "Efetivo".');
    const wsEf = wb.Sheets[sheetEfetivo];
    const efetivoRows: { idFunc: string; nome: string; postoGrad: string }[] = [];
    const efRange = XLSX.utils.decode_range(wsEf["!ref"] ?? "A1:Y101");
    for (let r = efRange.s.r + 1; r <= efRange.e.r; r++) {
      const idFunc = wsEf[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
      const nome = wsEf[XLSX.utils.encode_cell({ r, c: 2 })]?.v;
      const posto = wsEf[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
      if (!nome) continue;
      efetivoRows.push({
        idFunc: normMatricula(idFunc),
        nome: String(nome),
        postoGrad: String(posto ?? ""),
      });
    }
    if (efetivoRows.length === 0) {
      throw new Error("Aba Efetivo está vazia.");
    }

    /* 4) Buscar militares cadastrados pelo usuário */
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

    /* 5) Montar runtime de militares (linhas R12, R15, R18, ...) */
    const militares: MilitarRT[] = efetivoRows.map((ef, i) => {
      const rowOrd = 12 + i * 3; // 1-indexed (R12, R15, R18...)
      const cad = cadPorMat.get(ef.idFunc) ?? cadPorNome.get(normNome(ef.nome));
      const funcao: "COV" | "CG" | "BM" = cad?.funcao ?? "BM";
      if (!cad) {
        alertas.push({
          tipo: "info",
          msg: `${ef.nome} (${ef.idFunc || "sem matrícula"}) não está no cadastro — escalado como BM comum.`,
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
      };
    });

    /* 6) Interpretar observações com IA */
    const ia = await interpretarObservacoes(
      data.parametros.observacoesTexto,
      militares.map((m) => ({ nome: m.nome, matricula: m.matricula })),
      data.mes, data.ano,
    );

    /* 7) Rodar motor */
    const dias = diasNoMes(data.mes, data.ano);
    const escala = escalar(militares, dias, data.parametros, ia, alertas);

    /* 8) Escrever no Anexo B (apenas linhas ORD; col F=idx5 até F+dias-1) */
    const COL_INI = 5; // F
    let escritas = 0;
    for (const [dia, slot] of escala.entries()) {
      const c = COL_INI + (dia - 1);
      for (const [rowOrd, sigla] of slot.entries()) {
        const addr = colLetter(c) + rowOrd;
        ws[addr] = { t: "s", v: sigla };
        escritas++;
      }
    }
    // Atualizar range se necessário
    range.e.c = Math.max(range.e.c, COL_INI + dias - 1);
    range.e.r = Math.max(range.e.r, 12 + militares.length * 3);
    ws["!ref"] = XLSX.utils.encode_range(range);

    /* 9) Serializar e subir no storage */
    const outBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${userId}/${data.ano}-${String(data.mes).padStart(2, "0")}-${ts}.xlsx`;

    const { error: upErr } = await supabase.storage
      .from("escalas")
      .upload(path, outBuf, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (upErr) throw new Error("Falha ao salvar arquivo: " + upErr.message);

    /* 10) Registrar no histórico */
    const { data: row, error: insErr } = await supabase
      .from("escalas_geradas")
      .insert({
        user_id: userId,
        mes: data.mes,
        ano: data.ano,
        arquivo_nome: data.fileName,
        diretrizes: data.parametros.observacoesTexto || null,
        observacoes_texto: data.parametros.observacoesTexto || null,
        parametros: data.parametros as unknown as Record<string, unknown>,
        arquivo_saida_path: path,
        status: "concluida",
        alertas: alertas as unknown as Record<string, unknown>[],
        exportacoes: [],
      })
      .select("id")
      .single();
    if (insErr) throw new Error("Falha ao registrar histórico: " + insErr.message);

    /* 11) Signed URL para download */
    const { data: signed } = await supabase.storage
      .from("escalas")
      .createSignedUrl(path, 60 * 60); // 1 hora

    return {
      ok: true,
      escalaId: row?.id,
      downloadUrl: signed?.signedUrl ?? null,
      escritas,
      alertas,
      iaResumo: {
        afastamentos: ia.afastamentos.length,
        reforcos: ia.reforcos.length,
        excecoes: ia.excecoes.length,
      },
      militaresProcessados: militares.length,
    };
  });
