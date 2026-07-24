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
interface SnapshotAssunto {
  tipo: string;
  titulo: string;
  texto_final: string;
  militar_id?: string | null;
  ferias_id?: string | null;
  campos?: Record<string, unknown>;
  campos_ausentes?: string[];
  pendencias?: string[];
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

export const gerarNbi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documento_id: string; confirmar_novo_ano?: boolean }) => ({
    documento_id: asUuid(input.documento_id),
    confirmar_novo_ano: Boolean(input.confirmar_novo_ano),
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

    // 2. Reserva número se ainda não reservado
    let numero = doc.numero_int as number | null;
    let ano = doc.numero_ano_local as number | null;
    if (!numero) {
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
        await auditar(data.documento_id, userId, "reservou", { numero, ano });
      }
    }

    // 3. Baixa modelo mestre do storage (admin, arquivo do sistema)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: modelo, error: eM } = await supabaseAdmin.storage
      .from("nbi-documentos")
      .download("_sistema/nbi-mestre-v1.docx");
    if (eM || !modelo) throw new Error("Modelo mestre indisponível");
    const modeloBuf = Buffer.from(await modelo.arrayBuffer());

    // 4. Monta payload de placeholders + seções
    const resp = (doc.responsaveis ?? {}) as SnapshotResponsaveis;
    const assuntosRaw = (doc.assuntos ?? []) as SnapshotAssunto[];
    const secoes = assuntosRaw.map((a) => ({
      TITULO_SECAO: (a.titulo ?? "").toUpperCase(),
      ITENS: (a.texto_final ?? "")
        .split(/\n{2,}/)
        .map((t) => ({ TEXTO_ITEM: t.trim() }))
        .filter((x) => x.TEXTO_ITEM.length > 0),
    }));

    const numeroFmt = String(numero ?? 0).padStart(3, "0");
    const placeholders: Record<string, string> = {
      UNIDADE_CABECALHO: resp.unidade?.nome ?? "",
      UNIDADE_SIGLA: resp.unidade?.sigla ?? "",
      NUMERO_NBI: numeroFmt,
      ANO_NBI: String(ano ?? anoLocal),
      DATA_DOCUMENTO: dataExtenso(doc.data_documento),
      LOCAL_DATA: `${resp.unidade?.sigla ?? ""}, ${dataExtenso(doc.data_documento)}`.trim(),
      NOME_DIGITADOR: resp.digitador?.nome ?? "",
      POSTO_DIGITADOR: resp.digitador?.posto_quadro ?? "",
      FUNCAO_DIGITADOR: resp.digitador?.funcao ?? "",
      LOTACAO_DIGITADOR: resp.digitador?.lotacao ?? "",
      NOME_COMANDANTE: resp.comandante?.nome ?? "",
      POSTO_COMANDANTE: resp.comandante?.posto_quadro ?? "",
      FUNCAO_COMANDANTE: resp.comandante?.funcao ?? "",
      LOTACAO_COMANDANTE: resp.comandante?.lotacao ?? "",
      NOME_AUTORIDADE: resp.autoridade?.nome ?? "",
      POSTO_AUTORIDADE: resp.autoridade?.posto_quadro ?? "",
      FUNCAO_AUTORIDADE: resp.autoridade?.funcao ?? "",
      LOTACAO_AUTORIDADE: resp.autoridade?.lotacao ?? "",
    };

    // 5. Renderiza DOCX
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;
    const zip = new PizZip(modeloBuf);
    const dt = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
    });
    dt.render({ ...placeholders, SECOES: secoes });
    const buf = dt.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;

    // 6. Upload no bucket
    const path = `${userId}/${ano}/nbi-${String(numero).padStart(3, "0")}-${data.documento_id}.docx`;
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
