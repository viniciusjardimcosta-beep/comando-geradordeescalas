// Server functions do módulo NBI — Bloco 5.
// Rendering DOCX, reserva de numeração, cancelamento, download, duplicação e auditoria.
// TODAS as ações mutantes exigem requireSupabaseAuth. Auditoria sempre gravada pelo
// backend com context.userId (nunca a partir de input do cliente).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  }) => ({
    documento_id: asUuid(input.documento_id),
    confirmar_novo_ano: Boolean(input.confirmar_novo_ano),
    modo_numeracao: input.modo_numeracao === "manual" ? "manual" as const : "automatico" as const,
    numero_manual: input.numero_manual != null ? Number(input.numero_manual) : null,
    ano_manual: input.ano_manual != null ? Number(input.ano_manual) : null,
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

    // 2. Reserva número — modo manual ou automático
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
        // Colisão: mesmo user_id + ano + numero já emitido (mesmo cancelado — número não reutilizado)
        const { data: existente } = await supabase
          .from("nbi_documents")
          .select("id")
          .eq("user_id", userId)
          .eq("numero_ano_local", a)
          .eq("numero_int", n)
          .neq("id", data.documento_id)
          .limit(1)
          .maybeSingle();
        if (existente) {
          return { ok: false as const, code: `Número ${String(n).padStart(3, "0")}/${a} já foi utilizado nesta unidade.` };
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

    // 3. Baixa modelo mestre do storage (admin, arquivo do sistema)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: modelo, error: eM } = await supabaseAdmin.storage
      .from("nbi-documentos")
      .download("_sistema/nbi-mestre-v2.docx");
    if (eM || !modelo) throw new Error("Modelo mestre indisponível");
    const modeloBuf = Buffer.from(await modelo.arrayBuffer());

    // 3.1 Cabeçalho oficial — fonte única: nbi_settings da unidade emissora.
    const { data: settings } = await supabase
      .from("nbi_settings")
      .select("cabecalho_estado, cabecalho_secretaria, cabecalho_corporacao, cabecalho_batalhao, cabecalho_subunidade, cabecalho_cidade, unidade_nome, unidade_sigla")
      .eq("user_id", userId)
      .maybeSingle();
    const cabecalho = {
      estado: (settings?.cabecalho_estado ?? "").trim(),
      secretaria: (settings?.cabecalho_secretaria ?? "").trim(),
      corporacao: (settings?.cabecalho_corporacao ?? "").trim(),
      batalhao: (settings?.cabecalho_batalhao ?? "").trim(),
      subunidade: (settings?.cabecalho_subunidade ?? settings?.unidade_nome ?? "").trim(),
      cidade: (settings?.cabecalho_cidade ?? "").trim(),
    };
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

    // 3.2 Mapa de títulos oficiais por código de template (uppercase p/ Word)
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

    // 4. Monta payload de placeholders + seções
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

    const numeroFmt = String(numero).padStart(3, "0");
    const dataNota = dataBR(doc.data_documento);

    // Objeto explícito enviado ao docxtemplater. Nomes de chaves fixos
    // acordados com o modelo mestre (sem acentos, sempre maiúsculo).
    const placeholders: Record<string, string> = {
      NUMERO_NOTA: numeroFmt,
      DATA_NOTA: dataNota,
      // Compatibilidade com chaves antigas do modelo mestre (caso ainda existam)
      NUMERO_NBI: numeroFmt,
      ANO_NBI: String(ano),
      DATA_DOCUMENTO: dataExtenso(doc.data_documento),

      // Cabeçalho oficial configurável
      ESTADO_CABECALHO: cabecalho.estado,
      SECRETARIA_CABECALHO: cabecalho.secretaria,
      CORPORACAO_CABECALHO: cabecalho.corporacao,
      BATALHAO_CABECALHO: cabecalho.batalhao,
      UNIDADE_CABECALHO: cabecalho.subunidade,
      UNIDADE_SIGLA: settings?.unidade_sigla ?? "",
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

    // Validação pré-renderização: nenhum campo obrigatório pode ser
    // undefined, null, vazio ou string "undefined"/"null".
    const obrigatorios = [
      "NUMERO_NOTA", "DATA_NOTA",
      "ESTADO_CABECALHO", "SECRETARIA_CABECALHO", "CORPORACAO_CABECALHO",
      "BATALHAO_CABECALHO", "UNIDADE_CABECALHO",
      "NOME_DIGITADOR", "POSTO_QUADRO_DIGITADOR", "FUNCAO_DIGITADOR",
      "NOME_COMANDANTE", "POSTO_QUADRO_COMANDANTE", "FUNCAO_COMANDANTE",
    ];
    const ausentes: string[] = [];
    for (const k of obrigatorios) {
      const v = placeholders[k];
      if (v === undefined || v === null || v === "" || v === "undefined" || v === "null" || v === "[object Object]") {
        ausentes.push(k);
      }
    }
    if (secoes.length === 0) ausentes.push("SECOES");
    if (ausentes.length > 0) {
      return {
        ok: false as const,
        code: `Campos obrigatórios ausentes: ${ausentes.join(", ")}`,
      };
    }

    // 5. Renderiza DOCX
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
    const path = `${userId}/${ano}/nbi-${numeroFmt}-${data.documento_id}.docx`;
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
    const { data: doc } = await supabase
      .from("nbi_documents")
      .select("id,canceled_at")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (!doc) throw new Error("Documento não encontrado");
    if (doc.canceled_at) return { ok: true as const, ja_cancelado: true };
    const { error } = await supabase
      .from("nbi_documents")
      .update({
        canceled_at: new Date().toISOString(),
        cancel_reason: data.motivo || "sem motivo informado",
        status: "cancelado",
      })
      .eq("id", data.documento_id);
    if (error) throw new Error("Falha ao cancelar");
    await auditar(data.documento_id, userId, "cancelou", { motivo: data.motivo });
    return { ok: true as const };
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
    // snapshot com nova data e limpa numeração para novo rascunho
    const snap = (orig.snapshot ?? {}) as { rascunho?: { numero?: string; data_documento?: string } };
    if (snap.rascunho) {
      snap.rascunho.numero = "";
      snap.rascunho.data_documento = hoje;
    }
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
