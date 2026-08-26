// Server functions do módulo NBI — Bloco 5.
// Rendering DOCX, reserva de numeração, cancelamento, download, duplicação e auditoria.
// TODAS as ações mutantes exigem requireSupabaseAuth. Auditoria sempre gravada pelo
// backend com context.userId (nunca a partir de input do cliente).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatarDataBR } from "@/utils/nbi";
import { normalizarCabecalho } from "@/lib/nbi/cabecalho";

// ---------- helpers de input ----------
function asUuid(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) {
    throw new Error("id inválido");
  }
  return v;
}

// ---------- auditoria (interna) ----------
async function auditar(
  documento_id: string,
  user_id: string,
  acao: "criou" | "editou" | "gerou" | "baixou" | "cancelou" | "duplicou" | "reservou",
  detalhe: Record<string, unknown> | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("nbi_auditoria").insert({
    documento_id,
    user_id,
    acao,
    detalhe: detalhe as never,
  });
}

// =============================================================
// 1. RESERVA DE NÚMERO — chama RPC nbi_reservar_numero
// =============================================================
export const reservarNumeroNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    documento_id: string;
    ano_local: number;
    confirmar_novo_ano?: boolean;
  }) => ({
    documento_id: asUuid(input.documento_id),
    ano_local: Number(input.ano_local),
    confirmar_novo_ano: Boolean(input.confirmar_novo_ano),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rpc, error } = await supabase.rpc("nbi_reservar_numero", {
      _documento_id: data.documento_id,
      _ano_local: data.ano_local,
      _confirmar_novo_ano: data.confirmar_novo_ano,
    });
    if (error) {
      return { ok: false as const, code: error.message };
    }
    const row = Array.isArray(rpc) ? rpc[0] : rpc;
    if (!row) return { ok: false as const, code: "sem_retorno" };
    if (row.reservado) {
      await auditar(data.documento_id, userId, "reservou", {
        numero: row.numero, ano: row.ano,
      });
    }
    return {
      ok: true as const,
      numero: row.numero as number,
      ano: row.ano as number,
      reservado: Boolean(row.reservado),
      motivo: row.motivo as string,
    };
  });

// =============================================================
// 2. PRÓXIMO NÚMERO PREVISTO (informativo, não reserva)
// =============================================================
export const proximoNumeroPrevisto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: num } = await supabase
      .from("nbi_numeracao")
      .select("ano_vigente,ultima_nota,reiniciar_anualmente,prefixo")
      .eq("user_id", userId)
      .maybeSingle();
    const ano_vigente = num?.ano_vigente ?? new Date().getFullYear();
    const ultima = num?.ultima_nota ?? 0;
    return {
      ano_vigente,
      ultima_nota: ultima,
      proximo: ultima + 1,
      reiniciar_anualmente: num?.reiniciar_anualmente ?? true,
      prefixo: num?.prefixo ?? null,
    };
  });

// =============================================================
// 2B. ESTADO DE UM NÚMERO (Bloco 12I) — informativo, nunca reserva.
// livre | cancelado (reutilização possível) | ativo (bloqueio absoluto)
// =============================================================
export const consultarNumeroNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numero: number; ano: number }) => ({
    numero: Number(input.numero),
    ano: Number(input.ano),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!Number.isFinite(data.numero) || data.numero < 1 || !Number.isFinite(data.ano)) {
      return { estado: "livre" as const, documento_id: null, cancel_reason: null, canceled_at: null };
    }
    const { data: docs } = await supabase
      .from("nbi_documents")
      .select("id,status,canceled_at,cancel_reason")
      .eq("user_id", userId)
      .eq("numero_ano_local", data.ano)
      .eq("numero_int", data.numero)
      .limit(10);
    const lista = docs ?? [];
    const ativo = lista.find((d) => d.status !== "cancelado");
    if (ativo) {
      return { estado: "ativo" as const, documento_id: ativo.id, cancel_reason: null, canceled_at: null };
    }
    const cancelado = lista[0];
    if (cancelado) {
      return {
        estado: "cancelado" as const,
        documento_id: cancelado.id,
        cancel_reason: cancelado.cancel_reason,
        canceled_at: cancelado.canceled_at,
      };
    }
    return { estado: "livre" as const, documento_id: null, cancel_reason: null, canceled_at: null };
  });



// =============================================================
// 3. GERAR DOCX — reserva (se necessário) → renderiza → upload → generated_at
// =============================================================
interface SnapshotSubstituicao {
  papel: "assuncao" | "dispensa";
  substituicao_id?: string | null;
  funcao?: string | null;
  motivo?: string | null;
  data_inicio?: string | null;
  data_fim_prevista?: string | null;
  substituto_militar_id?: string | null;
  titular_militar_id?: string | null;
  /** Data de início da Assunção vinculada — desempata o fallback antigo. */
  data_inicio_assuncao?: string | null;

}

interface SnapshotAssunto {
  tipo: string;
  titulo: string;
  texto_final: string;
  militar_id?: string | null;
  ferias_id?: string | null;
  campos?: Record<string, unknown>;
  campos_ausentes?: string[];
  pendencias?: string[];
  substituicao?: SnapshotSubstituicao | null;
}


interface SnapshotResponsaveis {
  unidade?: { nome?: string; sigla?: string };
  digitador?: { nome?: string; posto_quadro?: string; funcao?: string; lotacao?: string };
  comandante?: { nome?: string; posto_quadro?: string; funcao?: string; lotacao?: string };
  autoridade?: { nome?: string; posto_quadro?: string; funcao?: string; lotacao?: string };
}

function mesExtenso(m: number): string {
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return nomes[m - 1] ?? "";
}
function dataExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  return `${String(d).padStart(2, "0")} de ${mesExtenso(m)} de ${y}`;
}


// Deduplica quadro/token repetido no posto_quadro (ex: "1º Sargento QPBM QPBM").
function dedupPostoQuadro(v: string | null | undefined): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const stripAcc = (x: string) =>
    x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const partes = s.split(" ");
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const p of partes) {
    const key = stripAcc(p);
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(p);
  }
  return out.join(" ");
}

export const gerarNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    documento_id: string;
    confirmar_novo_ano?: boolean;
    modo_numeracao?: "manual" | "automatico";
    numero_manual?: number | null;
    ano_manual?: number | null;
    /** Bloco 12I — UUID da NBI cancelada cujo número será reutilizado. */
    reutilizar_numero_de?: string | null;
  }) => ({
    documento_id: asUuid(input.documento_id),
    confirmar_novo_ano: Boolean(input.confirmar_novo_ano),
    modo_numeracao: input.modo_numeracao === "manual" ? "manual" as const : "automatico" as const,
    numero_manual: input.numero_manual != null ? Number(input.numero_manual) : null,
    ano_manual: input.ano_manual != null ? Number(input.ano_manual) : null,
    reutilizar_numero_de: input.reutilizar_numero_de ? asUuid(input.reutilizar_numero_de) : null,
  }))

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Carrega o documento (RLS confirma propriedade)
    const { data: doc, error: eDoc } = await supabase
      .from("nbi_documents")
      .select("*")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (eDoc || !doc) throw new Error("Documento não encontrado");
    if (doc.canceled_at) throw new Error("Documento cancelado");

    const anoLocal = new Date(doc.data_documento + "T00:00:00Z").getUTCFullYear();

    // =========================================================
    // 2. PRÉ-VALIDAÇÃO ESTRUTURAL (Bloco 12E)
    // Tudo que NÃO depende do número é verificado ANTES da reserva.
    // Uma NBI estruturalmente inválida jamais consome um número oficial.
    // =========================================================
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2.1 Modelo mestre do storage (admin, arquivo do sistema)
    const { data: modelo, error: eM } = await supabaseAdmin.storage
      .from("nbi-documentos")
      .download("_sistema/nbi-mestre-v4.docx");
    if (eM || !modelo) throw new Error("Modelo mestre indisponível");
    const modeloBuf = Buffer.from(await modelo.arrayBuffer());

    // 2.2 Cabeçalho oficial — fonte única: nbi_settings da unidade emissora.
    const { data: settings } = await supabase
      .from("nbi_settings")
      .select("cabecalho_estado, cabecalho_secretaria, cabecalho_corporacao, cabecalho_batalhao, cabecalho_subunidade, cabecalho_cidade, unidade_nome, unidade_sigla, boletim_nome, boletim_sigla")
      .eq("user_id", userId)
      .maybeSingle();
    // Bloco 10C — normalização institucional aplicada NO MOMENTO DA GERAÇÃO:
    // configurações antigas ("15ª BATALHAO", "8º COMPANHIA") saem corrigidas
    // sem exigir que o usuário reabra e salve as Configurações NBI.
    // Linhas iniciadas por "!" são exceções confirmadas e saem literalmente.
    const cabecalho = normalizarCabecalho({
      estado: settings?.cabecalho_estado ?? "",
      secretaria: settings?.cabecalho_secretaria ?? "",
      corporacao: settings?.cabecalho_corporacao ?? "",
      batalhao: settings?.cabecalho_batalhao ?? "",
      subunidade: settings?.cabecalho_subunidade ?? settings?.unidade_nome ?? "",
      cidade: settings?.cabecalho_cidade ?? "",
    });
    const cabecalhoFaltando: string[] = [];
    if (!cabecalho.estado) cabecalhoFaltando.push("Estado");
    if (!cabecalho.secretaria) cabecalhoFaltando.push("Secretaria");
    if (!cabecalho.corporacao) cabecalhoFaltando.push("Corporação");
    if (!cabecalho.batalhao) cabecalhoFaltando.push("Batalhão");
    if (!cabecalho.subunidade) cabecalhoFaltando.push("Subunidade (Unidade)");
    if (cabecalhoFaltando.length > 0) {
      return {
        ok: false as const,
        code: `Cabeçalho oficial incompleto em Configurações NBI: ${cabecalhoFaltando.join(", ")}.`,
      };
    }

    // 2.3 Mapa de títulos oficiais por código de template (uppercase p/ Word)
    const { data: tpls } = await supabaseAdmin
      .from("nbi_templates")
      .select("codigo, titulo, titulo_documento");
    const { tituloDocumentoDoRegistry } = await import("@/lib/nbi/motores/registry");
    const tituloOficialPorCodigo = new Map<string, string>();
    for (const t of tpls ?? []) {
      const oficial = (
        (t as { titulo_documento?: string | null }).titulo_documento
        ?? t.titulo
        ?? tituloDocumentoDoRegistry(t.codigo)
        ?? ""
      ).toUpperCase();
      tituloOficialPorCodigo.set(t.codigo, oficial);
    }

    // 2.4 Monta seções a partir dos assuntos persistidos
    const resp = (doc.responsaveis ?? {}) as unknown as SnapshotResponsaveis;
    const assuntosRaw = (doc.assuntos ?? []) as unknown as SnapshotAssunto[];

    // Agrupamento GLOBAL por tipo/título oficial: todos os itens do mesmo tipo
    // ficam sob um único título, preservando a ordem de primeira aparição.
    // Nunca duplica cabeçalho de seção mesmo que os assuntos sejam intercalados.
    const secoesMap = new Map<string, { TITULO_SECAO: string; ITENS: Array<{ TEXTO_ITEM: string }> }>();
    const ordemChaves: string[] = [];
    for (const a of assuntosRaw) {
      const codigo = (a as { tipo?: string; template_codigo?: string }).template_codigo
        ?? (a as { tipo?: string }).tipo
        ?? "";
      const titulo = (
        tituloOficialPorCodigo.get(codigo) ??
        (a.titulo ?? "").toUpperCase()
      ).trim();
      if (!titulo) continue;
      const itens = (a.texto_final ?? "")
        .split(/\n{2,}/)
        .map((t) => ({ TEXTO_ITEM: t.trim() }))
        .filter((x) => x.TEXTO_ITEM.length > 0);
      if (itens.length === 0) continue;
      const chave = titulo;
      if (!secoesMap.has(chave)) {
        secoesMap.set(chave, { TITULO_SECAO: titulo, ITENS: [] });
        ordemChaves.push(chave);
      }
      secoesMap.get(chave)!.ITENS.push(...itens);
    }
    const secoes = ordemChaves.map((k) => secoesMap.get(k)!);

    // Bloco 10C — data sempre formatada, nunca concatenada manualmente.
    const dataNota = formatarDataBR(doc.data_documento);

    // 2.5 Placeholders que independem do número reservado.
    const placeholdersBase: Record<string, string> = {
      DATA_NOTA: dataNota,
      DATA_DOCUMENTO: dataExtenso(doc.data_documento),

      // Cabeçalho oficial configurável
      ESTADO_CABECALHO: cabecalho.estado,
      SECRETARIA_CABECALHO: cabecalho.secretaria,
      CORPORACAO_CABECALHO: cabecalho.corporacao,
      BATALHAO_CABECALHO: cabecalho.batalhao,
      UNIDADE_CABECALHO: cabecalho.subunidade,
      UNIDADE_SIGLA: settings?.unidade_sigla ?? "",

      // RF-06 — nomenclatura do boletim definida em Configurações NBI.
      BOLETIM_NOME: ((settings as { boletim_nome?: string | null } | null)?.boletim_nome ?? "").trim() || "Boletim",
      BOLETIM_SIGLA: ((settings as { boletim_sigla?: string | null } | null)?.boletim_sigla ?? "").trim() || "BI",
      LOCAL_DATA: `${cabecalho.cidade || settings?.unidade_sigla || ""}, ${dataExtenso(doc.data_documento)}`.trim(),

      NOME_DIGITADOR: resp.digitador?.nome ?? "",
      POSTO_QUADRO_DIGITADOR: dedupPostoQuadro(resp.digitador?.posto_quadro),
      POSTO_DIGITADOR: dedupPostoQuadro(resp.digitador?.posto_quadro),
      FUNCAO_DIGITADOR: resp.digitador?.funcao ?? "",
      LOTACAO_DIGITADOR: resp.digitador?.lotacao ?? "",

      NOME_COMANDANTE: resp.comandante?.nome ?? "",
      POSTO_QUADRO_COMANDANTE: dedupPostoQuadro(resp.comandante?.posto_quadro),
      POSTO_COMANDANTE: dedupPostoQuadro(resp.comandante?.posto_quadro),
      FUNCAO_COMANDANTE: resp.comandante?.funcao ?? "",
      LOTACAO_COMANDANTE: resp.comandante?.lotacao ?? "",

      NOME_AUTORIDADE: resp.autoridade?.nome ?? "",
      POSTO_QUADRO_AUTORIDADE: dedupPostoQuadro(resp.autoridade?.posto_quadro),
      POSTO_AUTORIDADE: dedupPostoQuadro(resp.autoridade?.posto_quadro),
      FUNCAO_AUTORIDADE: resp.autoridade?.funcao ?? "",
      LOTACAO_AUTORIDADE: resp.autoridade?.lotacao ?? "",
    };

    // 2.6 Validação estrutural: nenhum campo obrigatório (independente do
    // número) pode ser vazio, e o documento precisa ter ao menos uma seção.
    const obrigatoriosBase = [
      "DATA_NOTA",
      "ESTADO_CABECALHO", "SECRETARIA_CABECALHO", "CORPORACAO_CABECALHO",
      "BATALHAO_CABECALHO", "UNIDADE_CABECALHO",
      "NOME_DIGITADOR", "POSTO_QUADRO_DIGITADOR", "FUNCAO_DIGITADOR",
      "NOME_COMANDANTE", "POSTO_QUADRO_COMANDANTE", "FUNCAO_COMANDANTE",
    ];
    const ausentes: string[] = [];
    for (const k of obrigatoriosBase) {
      const v = placeholdersBase[k];
      if (v === undefined || v === null || v === "" || v === "undefined" || v === "null" || v === "[object Object]") {
        ausentes.push(k);
      }
    }
    if (assuntosRaw.length === 0 || secoes.length === 0) ausentes.push("SECOES");
    if (ausentes.length > 0) {
      // Retorno ANTES de qualquer reserva: nenhum número é consumido.
      return {
        ok: false as const,
        code: `Campos obrigatórios ausentes: ${ausentes.join(", ")}`,
      };
    }

    // 3. Reserva número — modo manual ou automático

    let numero = doc.numero_int as number | null;
    let ano = doc.numero_ano_local as number | null;

    if (!numero) {
      if (data.modo_numeracao === "manual") {
        // Modo manual: validar entradas e checar colisão
        const n = data.numero_manual;
        const a = data.ano_manual ?? anoLocal;
        if (!n || !Number.isFinite(n) || n < 1 || n > 9999) {
          return { ok: false as const, code: "Número manual inválido (1–9999)." };
        }
        if (a !== anoLocal) {
          return { ok: false as const, code: `Ano informado (${a}) diverge do ano da data do documento (${anoLocal}).` };
        }
        // Bloco 12I — REUTILIZAÇÃO CONTROLADA de número de NBI CANCELADA.
        // Só ocorre com confirmação explícita, via RPC dedicada.
        if (data.reutilizar_numero_de) {
          const { error: eRe } = await supabase.rpc("nbi_reutilizar_numero", {
            _documento_id: data.documento_id,
            _origem_documento_id: data.reutilizar_numero_de,
            _numero: n,
            _ano: a,
          });
          if (eRe) return { ok: false as const, code: eRe.message };
          // Rastreabilidade no snapshot (allowlist de snapshotMeta).
          const { supabaseAdmin: saR } = await import("@/integrations/supabase/client.server");
          const { data: snapAtual } = await supabase
            .from("nbi_documents").select("snapshot").eq("id", data.documento_id).maybeSingle();
          const base = (snapAtual?.snapshot ?? {}) as Record<string, unknown>;
          await saR.from("nbi_documents").update({
            snapshot: {
              ...base,
              numero_reutilizado: true,
              numero_reutilizado_de_documento_id: data.reutilizar_numero_de,
              numero_reutilizado_em: new Date().toISOString(),
              numero_reutilizado_confirmado_por: userId,
            } as never,
          }).eq("id", data.documento_id).eq("user_id", userId);
          numero = n; ano = a;
        } else {
        // Colisão com documento ATIVO: bloqueio absoluto.
        // Documento CANCELADO não bloqueia, mas exige confirmação explícita
        // de reutilização (nunca assumida em silêncio pelo servidor).
        const { data: existente } = await supabase
          .from("nbi_documents")
          .select("id,status")
          .eq("user_id", userId)
          .eq("numero_ano_local", a)
          .eq("numero_int", n)
          .neq("id", data.documento_id)
          .order("status", { ascending: true })
          .limit(5);
        const ativo = (existente ?? []).find((d) => d.status !== "cancelado");
        const cancelado = (existente ?? []).find((d) => d.status === "cancelado");
        if (ativo) {
          return { ok: false as const, code: `Número ${String(n).padStart(3, "0")}/${a} já está em uso por uma NBI ativa desta unidade.` };
        }
        if (cancelado) {
          return {
            ok: false as const,
            code: `O número ${String(n).padStart(3, "0")}/${a} pertence a uma NBI cancelada. Confirme a reutilização ou use o próximo número disponível.`,
          };
        }
        // Aplica número manual no documento
        const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
        const { error: eMan } = await sa
          .from("nbi_documents")
          .update({
            numero_int: n,
            numero_ano_local: a,
            numero: String(n).padStart(3, "0"),
            ano: a,
            reserved_at: new Date().toISOString(),
            status: "reservado",
          })
          .eq("id", data.documento_id)
          .eq("user_id", userId);
        if (eMan) return { ok: false as const, code: "Falha ao aplicar número manual." };


        // Atualiza nbi_numeracao se avançou a sequência (mesmo ano_vigente) ou novo ano
        const { data: numRow } = await sa
          .from("nbi_numeracao")
          .select("id,ano_vigente,ultima_nota")
          .eq("user_id", userId)
          .maybeSingle();
        if (!numRow) {
          await sa.from("nbi_numeracao").insert({
            user_id: userId, ano_vigente: a, ultima_nota: n, reiniciar_anualmente: true,
          });
        } else if (a > numRow.ano_vigente) {
          await sa.from("nbi_numeracao").update({ ano_vigente: a, ultima_nota: n }).eq("id", numRow.id);
        } else if (a === numRow.ano_vigente && n > numRow.ultima_nota) {
          await sa.from("nbi_numeracao").update({ ultima_nota: n }).eq("id", numRow.id);
        }
        await sa.from("nbi_numeracao_log").insert({
          user_id: userId,
          acao: "manual",
          antes: { ano_vigente: numRow?.ano_vigente ?? null, ultima_nota: numRow?.ultima_nota ?? null },
          depois: { ano_vigente: a, ultima_nota: Math.max(n, numRow?.ultima_nota ?? 0) },
          detalhe: `manual documento ${data.documento_id}`,
        });
        numero = n; ano = a;
        await auditar(data.documento_id, userId, "reservou", { numero, ano, modo: "manual" });
        }

      } else {
        const { data: rpc, error: eR } = await supabase.rpc("nbi_reservar_numero", {
          _documento_id: data.documento_id,
          _ano_local: anoLocal,
          _confirmar_novo_ano: data.confirmar_novo_ano,
        });
        if (eR) {
          return { ok: false as const, code: eR.message };
        }
        const row = Array.isArray(rpc) ? rpc[0] : rpc;
        numero = row?.numero as number;
        ano = row?.ano as number;
        if (row?.reservado) {
          await auditar(data.documento_id, userId, "reservou", { numero, ano, modo: "automatico" });
        }
      }
    }

    // Confirma que número e ano estão definidos antes de prosseguir.
    if (!numero || !ano) {
      throw new Error("Número da NBI não pôde ser reservado");
    }

    // 5. Prefixo de numeração e placeholders dependentes do número.
    // Bloco 12D — prefixo (ex.: "TESTE") vem de nbi_numeracao do próprio usuário.
    const { data: numRowPrefixo } = await supabase
      .from("nbi_numeracao")
      .select("prefixo")
      .eq("user_id", userId)
      .maybeSingle();
    const prefixoNum = ((numRowPrefixo?.prefixo ?? "") as string).trim();
    const numeroBase = String(numero).padStart(3, "0");
    const numeroFmt = prefixoNum ? `${prefixoNum} ${numeroBase}` : numeroBase;

    const placeholders: Record<string, string> = {
      ...placeholdersBase,
      NUMERO_NOTA: numeroFmt,
      // Compatibilidade com chaves antigas do modelo mestre (caso ainda existam)
      NUMERO_NBI: numeroFmt,
      ANO_NBI: String(ano),
    };
    if (!numeroFmt) {
      return { ok: false as const, code: "Campos obrigatórios ausentes: NUMERO_NOTA" };
    }


    // 6. Renderiza DOCX
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;
    const zip = new PizZip(modeloBuf);
    const dt = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      // Nunca deixe passar "undefined" — retorna string vazia e coletamos ausentes.
      nullGetter: () => "",
    });
    dt.render({ ...placeholders, SECOES: secoes });

    // Validação pós-renderização: nenhum placeholder residual ou "undefined".
    const textoRender = dt.getFullText();
    const residuoPlaceholder = /\{[A-Z0-9_]+\}/.test(textoRender);
    const residuoUndef = /\b(undefined|null)\b/.test(textoRender);
    if (residuoPlaceholder || residuoUndef) {
      const amostras = [
        ...(textoRender.match(/\{[A-Z0-9_]+\}/g) ?? []),
        ...(textoRender.match(/\b(undefined|null)\b/g) ?? []),
      ];
      return {
        ok: false as const,
        code: `Documento contém marcadores não substituídos: ${Array.from(new Set(amostras)).slice(0, 6).join(", ")}`,
      };
    }

    const buf = dt.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

    // 6. Upload no bucket
    const path = `${userId}/${ano}/nbi-${numeroBase}-${data.documento_id}.docx`;
    const { error: eU } = await supabaseAdmin.storage
      .from("nbi-documentos")
      .upload(path, buf, {
        upsert: true,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    if (eU) throw new Error("Falha ao salvar documento gerado");

    // 7. Marca generated_at (apenas após upload OK)
    const { error: eUp } = await supabaseAdmin
      .from("nbi_documents")
      .update({
        generated_at: new Date().toISOString(),
        storage_path: path,
        status: "gerado",
      })
      .eq("id", data.documento_id)
      .eq("user_id", userId);
    if (eUp) throw new Error("Falha ao atualizar documento");

    await auditar(data.documento_id, userId, "gerou", {
      numero, ano, storage_path: path,
    });

    // 8. Bloco 8C — ciclo de vida das substituições (não altera o DOCX gerado).
    for (const a of assuntosRaw) {
      const s = a.substituicao;
      if (!s) continue;
      try {
        if (s.papel === "assuncao") {
          // Bloco 10C — CAUSA RAIZ CORRIGIDA: a chave de idempotência usava
          // apenas (documento, substituto, titular). Duas Assunções distintas
          // do mesmo par (funções/datas diferentes) eram tratadas como
          // repetição e a segunda nunca era inserida. A assinatura agora
          // inclui função e data de início.
          const { data: candidatos } = await supabaseAdmin
            .from("nbi_substituicoes")
            .select("id,funcao,data_inicio")
            .eq("user_id", userId)
            .eq("assuncao_documento_id", data.documento_id)
            .eq("substituto_militar_id", s.substituto_militar_id ?? "")
            .eq("titular_militar_id", s.titular_militar_id ?? "");
          const jaExiste = (candidatos ?? []).some(
            (c) =>
              (c.funcao ?? "") === (s.funcao ?? "") &&
              (c.data_inicio ?? "") === (s.data_inicio || ""),
          );
          if (jaExiste) continue;
          await supabaseAdmin.from("nbi_substituicoes").insert({
            user_id: userId,
            assuncao_documento_id: data.documento_id,
            substituto_militar_id: s.substituto_militar_id ?? null,
            titular_militar_id: s.titular_militar_id ?? null,
            funcao: s.funcao ?? null,
            motivo: s.motivo ?? null,
            data_inicio: s.data_inicio || null,
            data_fim_prevista: s.data_fim_prevista || null,
            status: "aberta",
            // Snapshot congelado: permite reabrir a Dispensa mesmo que o
            // cadastro do militar mude depois.
            snapshot: {
              funcao: s.funcao ?? null,
              motivo: s.motivo ?? null,
              data_inicio: s.data_inicio || null,
              data_fim_prevista: s.data_fim_prevista || null,
              titular_militar_id: s.titular_militar_id ?? null,
              substituto_militar_id: s.substituto_militar_id ?? null,
            },
          });
        } else {
          // Dispensa: o fluxo normal SEMPRE envia substituicao_id.
          // A busca por par titular/substituto é apenas fallback para
          // registros antigos e agora desempata por função e data.
          let alvo = s.substituicao_id ?? null;
          if (!alvo && s.substituto_militar_id && s.titular_militar_id) {
            const { data: abertas } = await supabaseAdmin
              .from("nbi_substituicoes")
              .select("id,funcao,data_inicio")
              .eq("user_id", userId)
              .eq("status", "aberta")
              .eq("substituto_militar_id", s.substituto_militar_id)
              .eq("titular_militar_id", s.titular_militar_id)
              .order("created_at", { ascending: false });
            const lista = abertas ?? [];
            // 1) função + data de início idênticas à assunção informada
            let escolhida =
              lista.find(
                (c) =>
                  (c.funcao ?? "") === (s.funcao ?? "") &&
                  (c.data_inicio ?? "") === (s.data_inicio_assuncao || ""),
              ) ??
              // 2) apenas a função (quando só ela é conhecida)
              lista.find((c) => (c.funcao ?? "") === (s.funcao ?? "")) ??
              null;
            // 3) ambiguidade: só encerra automaticamente se houver UMA aberta
            if (!escolhida && lista.length === 1) escolhida = lista[0];
            alvo = escolhida?.id ?? null;
          }
          if (!alvo) continue;
          await supabaseAdmin
            .from("nbi_substituicoes")
            .update({
              status: "encerrada",
              dispensa_documento_id: data.documento_id,
              data_fim_efetiva: s.data_inicio || null,
            })
            .eq("id", alvo)
            .eq("user_id", userId)
            .eq("status", "aberta");
        }
      } catch {
        // Falha no vínculo nunca invalida o documento já gerado e numerado.
      }

    }



    return { ok: true as const, numero, ano, storage_path: path };
  });

// =============================================================
// 4. LINK DE DOWNLOAD (signed URL) — usa o DOCX original salvo
// =============================================================
export const baixarNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento_id: string }) => ({
    documento_id: asUuid(input.documento_id),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("nbi_documents")
      .select("id,storage_path,numero,ano")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (!doc || !doc.storage_path) throw new Error("Documento ainda não gerado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("nbi-documentos")
      .createSignedUrl(doc.storage_path, 300);
    if (error || !signed) throw new Error("Falha ao gerar link");
    await auditar(data.documento_id, userId, "baixou", { path: doc.storage_path });
    return {
      ok: true as const,
      url: signed.signedUrl,
      filename: `NBI-${String(doc.numero ?? "").padStart(3, "0")}-${doc.ano ?? ""}.docx`,
    };
  });

// =============================================================
// 5. CANCELAR NBI — preserva número, arquivo e snapshot
// =============================================================
export const cancelarNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento_id: string; motivo: string }) => ({
    documento_id: asUuid(input.documento_id),
    motivo: String(input.motivo ?? "").trim().slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Estado anterior: já cancelado é idempotente e NÃO gera nova auditoria.
    const { data: antes } = await supabase
      .from("nbi_documents")
      .select("id,canceled_at")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (!antes) throw new Error("Documento não encontrado");
    if (antes.canceled_at) return { ok: true as const, ja_cancelado: true };

    // Bloco 12G — o UPDATE direto era barrado pela policy (status = 'rascunho')
    // e devolvia 0 linhas SEM erro, produzindo falso sucesso em NBI gerada.
    // Agora o cancelamento passa por RPC dedicada (SECURITY DEFINER) que valida
    // propriedade e altera SOMENTE status, canceled_at e cancel_reason.
    const { error } = await supabase.rpc("nbi_cancelar_documento", {
      _documento_id: data.documento_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error("Falha ao cancelar");

    // Verificação obrigatória: sem estado cancelado confirmado no banco não há
    // sucesso, não há auditoria de cancelamento e a UI recebe erro.
    const { data: doc } = await supabase
      .from("nbi_documents")
      .select("id,status,canceled_at,cancel_reason")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (!doc || doc.status !== "cancelado" || !doc.canceled_at || !doc.cancel_reason) {
      throw new Error("Falha ao cancelar");
    }

    await auditar(data.documento_id, userId, "cancelou", {
      motivo: doc.cancel_reason,
      canceled_at: doc.canceled_at,
    });
    return { ok: true as const, ja_cancelado: false };
  });



// =============================================================
// 6. DUPLICAR NBI (cria novo rascunho a partir do snapshot)
// =============================================================
export const duplicarNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento_id: string }) => ({
    documento_id: asUuid(input.documento_id),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: orig } = await supabase
      .from("nbi_documents")
      .select("snapshot,responsaveis,assuntos,titulo,data_documento")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (!orig) throw new Error("Documento original não encontrado");
    const hoje = new Date().toISOString().slice(0, 10);
    // snapshot com nova data e limpa numeração para novo rascunho.
    // Bloco 12G — rastreabilidade da origem dentro do próprio snapshot (sem
    // alteração estrutural de tabela). O documento original NÃO é tocado.
    const snap = (orig.snapshot ?? {}) as {
      rascunho?: { numero?: string; data_documento?: string };
      origem_documento_id?: string;
      duplicado_em?: string;
    };
    if (snap.rascunho) {
      snap.rascunho.numero = "";
      snap.rascunho.data_documento = hoje;
    }
    snap.origem_documento_id = data.documento_id;
    snap.duplicado_em = new Date().toISOString();

    const { data: novo, error } = await supabase
      .from("nbi_documents")
      .insert({
        user_id: userId,
        data_documento: hoje,
        titulo: `Cópia — ${orig.titulo ?? ""}`,
        assuntos: orig.assuntos as never,
        responsaveis: orig.responsaveis as never,
        snapshot: snap as never,
        status: "rascunho",
      })
      .select("id")
      .single();
    if (error || !novo) throw new Error("Falha ao duplicar");
    await auditar(novo.id, userId, "duplicou", { origem: data.documento_id });
    return { ok: true as const, id: novo.id };
  });

// =============================================================
// 7. LISTAR AUDITORIA de um documento
// =============================================================
export const listarAuditoriaNbi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento_id: string }) => ({
    documento_id: asUuid(input.documento_id),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("nbi_auditoria")
      .select("id,acao,detalhe,created_at")
      .eq("documento_id", data.documento_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
