// Bloco 11B — Folga compensatória: catálogo de motivos e cálculo dos meses.
// Nenhum texto oficial de modelo vive aqui: a redação está em nbi_templates.
// Este arquivo guarda apenas (a) os motivos homologados que entram após
// "em virtude de" e (b) a regra de mês de referência → mês de compensação.

export const MESES_FOLGA = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

export interface MotivoFolga {
  id: string;
  /** Rótulo exibido na interface. */
  label: string;
  /** Texto documental — entra logo após "em virtude de". */
  texto: string;
}

/**
 * Motivos observados nos exemplares oficiais de FOLGA COMPENSATÓRIA
 * (NBI 14/2026, NBI 18/2026, NBI 21/2026 e NBI 28/2025).
 */
export const MOTIVOS_FOLGA: MotivoFolga[] = [
  { id: "ajustes_finais_mapa", label: "Ajustes finais no mapa", texto: "ajustes finais no mapa" },
  {
    id: "ajustes_escala",
    label: "Ajustes de escala",
    texto: "ajustes no mapa por conta de ajustes de escala",
  },
  { id: "outro", label: "Outro motivo homologado", texto: "" },
];

export const MOTIVO_FOLGA_PADRAO = "ajustes_escala";

/** Texto documental do motivo escolhido ("outro" devolve null: texto livre). */
export function textoMotivoFolga(id: string): string | null {
  const m = MOTIVOS_FOLGA.find((x) => x.id === id);
  if (!m || !m.texto) return null;
  return m.texto;
}

/** Descobre o motivo catalogado a partir do texto já gravado (rascunhos). */
export function motivoFolgaPorTexto(texto: string): MotivoFolga | null {
  const alvo = (texto || "").trim().toLowerCase();
  if (!alvo) return null;
  return MOTIVOS_FOLGA.find((m) => m.texto && m.texto.toLowerCase() === alvo) ?? null;
}

export interface MesesFolga {
  /** "YYYY-MM" normalizado do mês de referência. */
  referenciaIso: string;
  /** Mês de referência por extenso, minúsculo (redação oficial). */
  referencia: string;
  /** Ano do mês de referência. */
  ano: string;
  /** "YYYY-MM" do mês de compensação (sempre o mês seguinte). */
  compensacaoIso: string;
  /** Mês de compensação por extenso, minúsculo. */
  compensacao: string;
  /** Ano do mês de compensação (avança em dezembro → janeiro). */
  anoCompensacao: string;
  /** true quando a virada de ano aconteceu (dezembro → janeiro). */
  viradaDeAno: boolean;
}

/**
 * Regra oficial: a compensação é sempre prevista para o mês SEGUINTE ao mês
 * de referência. Dezembro → janeiro do ano seguinte. O operador nunca informa
 * o mês previsto.
 */
export function calcularMesesFolga(mesRef: string): MesesFolga | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec((mesRef || "").trim());
  if (!m) return null;
  const ano = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (!Number.isFinite(ano) || mes < 1 || mes > 12) return null;

  const viradaDeAno = mes === 12;
  const mesSeguinte = viradaDeAno ? 1 : mes + 1;
  const anoSeguinte = viradaDeAno ? ano + 1 : ano;
  const dois = (n: number) => String(n).padStart(2, "0");

  return {
    referenciaIso: `${ano}-${dois(mes)}`,
    referencia: MESES_FOLGA[mes - 1],
    ano: String(ano),
    compensacaoIso: `${anoSeguinte}-${dois(mesSeguinte)}`,
    compensacao: MESES_FOLGA[mesSeguinte - 1],
    anoCompensacao: String(anoSeguinte),
    viradaDeAno,
  };
}

/** Subtipos oficiais da folga compensatória (redações distintas, nunca mescladas). */
export interface SubtipoFolga {
  id: string;
  label: string;
  /** Código do template em nbi_templates com a redação oficial. */
  template: string;
}

export const SUBTIPOS_FOLGA: SubtipoFolga[] = [
  { id: "previsao", label: "Horas a compensar (previsão)", template: "folga_compensatoria" },
  { id: "realizada", label: "Compensação já realizada", template: "folga_compensatoria_realizada" },
];

export const SUBTIPO_FOLGA_PADRAO = "previsao";

export function subtipoFolga(id: string): SubtipoFolga {
  return SUBTIPOS_FOLGA.find((s) => s.id === id) ?? SUBTIPOS_FOLGA[0];
}

/** Campos exibidos por subtipo (a variante "realizada" não usa MOTIVO). */
export function campoDoSubtipoFolga(subtipoId: string, chave: string): boolean {
  if (chave.toUpperCase() === "MOTIVO") return subtipoId !== "realizada";
  return true;
}
