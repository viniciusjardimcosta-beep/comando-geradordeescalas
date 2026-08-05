// Bloco 12 — Derivação da base: situação documental, afastamentos e deduplicação.
// PURO: só transforma o que foi carregado em lote. Nunca consulta nem grava.

import type {
  Afastamento, BaseConsistencia, DocumentoBase, StatusDocumento, AssuntoSnapshot,
} from "./tipos";

/** Situação institucional do documento (condição 3 da autorização). */
export function situacaoDocumento(d: Pick<DocumentoBase, "status" | "canceled_at">): StatusDocumento {
  if (d.canceled_at) return "cancelado";
  if (d.status === "gerado") return "gerado";
  if (d.status === "reservado") return "reservado";
  return "rascunho";
}

/**
 * Fato documental confirmado. Rascunho e reservado NÃO satisfazem pendência
 * nem valem como documento oficial ativo; cancelado é apenas histórico.
 */
export function documentoConfirmado(d: Pick<DocumentoBase, "status" | "canceled_at">): boolean {
  return situacaoDocumento(d) === "gerado";
}

export function rotuloDocumento(d: DocumentoBase): string {
  const num = d.numero ? String(d.numero).padStart(3, "0") : "s/nº";
  return `NBI ${num}/${d.ano ?? d.data_documento.slice(0, 4)}`;
}

export function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function dataValida(v: unknown): string | null {
  const s = texto(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Sobreposição de intervalos fechados (considera período, não dia isolado). */
export function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return aIni <= bFim && bIni <= aFim;
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diffDias(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

const TIPOS_AFASTAMENTO = new Set(["ferias", "licenca_paternidade", "luto", "nupcias"]);

function periodoDoAssunto(a: AssuntoSnapshot): { inicio: string; fim: string } | null {
  const inicio = dataValida(a.campos.DATA_INICIO);
  if (!inicio) return null;
  const fim = dataValida(a.campos.DATA_FIM);
  if (fim) return { inicio, fim };
  const dias = parseInt(texto(a.campos.QTD_DIAS), 10);
  if (Number.isFinite(dias) && dias > 0) return { inicio, fim: somarDias(inicio, dias - 1) };
  const apres = dataValida(a.campos.DATA_APRESENTACAO);
  if (apres) return { inicio, fim: somarDias(apres, -1) };
  return null;
}

/**
 * Afastamentos conhecidos do militar.
 * Deduplicação (condição 4): quando a mesma férias existir no banco e na NBI,
 * o vínculo é o `ferias_id`; as datas vêm do banco de férias (fonte primária)
 * e a NBI entra apenas como comprovação documental — um único evento.
 */
export function coletarAfastamentos(base: BaseConsistencia, militarId?: string | null): Afastamento[] {
  const out: Afastamento[] = [];
  const porFeriasId = new Map<string, Afastamento>();

  for (const f of base.ferias) {
    if (militarId && f.militar_id !== militarId) continue;
    const af: Afastamento = {
      tipo: "ferias",
      militar_id: f.militar_id,
      inicio: f.data_inicio,
      fim: f.data_fim,
      apresentacao: somarDias(f.data_fim, 1),
      origem: "banco_ferias",
      ferias_id: f.id,
      documento_id: null,
      rotuloDocumento: null,
    };
    porFeriasId.set(f.id, af);
    out.push(af);
  }

  for (const d of base.documentos) {
    if (!documentoConfirmado(d)) continue;
    for (const a of d.assuntos) {
      if (!TIPOS_AFASTAMENTO.has(a.tipo)) continue;
      if (militarId && a.militar_id !== militarId) continue;
      const fid = texto(a.ferias_id);
      if (fid && porFeriasId.has(fid)) {
        // Mesma férias já vinda do banco: apenas anexa a comprovação documental.
        const af = porFeriasId.get(fid)!;
        af.documento_id = d.id;
        af.rotuloDocumento = rotuloDocumento(d);
        const apres = dataValida(a.campos.DATA_APRESENTACAO);
        if (apres) af.apresentacao = apres;
        continue;
      }
      const p = periodoDoAssunto(a);
      if (!p || !a.militar_id) continue;
      out.push({
        tipo: a.tipo as Afastamento["tipo"],
        militar_id: a.militar_id,
        inicio: p.inicio,
        fim: p.fim,
        apresentacao: dataValida(a.campos.DATA_APRESENTACAO) ?? somarDias(p.fim, 1),
        origem: "documento_nbi",
        ferias_id: fid || null,
        documento_id: d.id,
        rotuloDocumento: rotuloDocumento(d),
      });
    }
  }

  return out.sort((x, y) => x.inicio.localeCompare(y.inicio));
}

/** Apresentações ativas (documento gerado) por militar. */
export function apresentacoesConfirmadas(base: BaseConsistencia, militarId?: string | null) {
  const out: Array<{ militar_id: string; data: string; ferias_id: string | null; subtipo: string | null; documento: DocumentoBase }> = [];
  for (const d of base.documentos) {
    if (!documentoConfirmado(d)) continue;
    for (const a of d.assuntos) {
      if (a.tipo !== "apresentacao" || !a.militar_id) continue;
      if (militarId && a.militar_id !== militarId) continue;
      out.push({
        militar_id: a.militar_id,
        data: dataValida(a.campos.DATA_APRESENTACAO) ?? dataValida(a.campos.DATA_INICIO) ?? d.data_documento,
        ferias_id: texto(a.ferias_id) || null,
        subtipo: a.subtipo ?? null,
        documento: d,
      });
    }
  }
  return out;
}
