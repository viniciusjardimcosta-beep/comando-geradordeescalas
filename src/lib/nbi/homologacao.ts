// Bloco 10E — Estados de homologação dos modelos NBI.
// Somente "homologado" pode gerar documento oficial e reservar número.
// Nenhum texto oficial vive aqui.

export type EstadoHomologacao =
  | "homologado"
  | "em_homologacao"
  | "aguardando_exemplar"
  | "bloqueado";

export const ESTADOS_HOMOLOGACAO: EstadoHomologacao[] = [
  "homologado", "em_homologacao", "aguardando_exemplar", "bloqueado",
];

export function normalizarEstado(v: string | null | undefined): EstadoHomologacao {
  const s = String(v ?? "").trim().toLowerCase();
  return (ESTADOS_HOMOLOGACAO as string[]).includes(s) ? (s as EstadoHomologacao) : "bloqueado";
}

/** Único estado que autoriza geração oficial e reserva de número. */
export function podeGerarOficial(estado: string | null | undefined): boolean {
  return normalizarEstado(estado) === "homologado";
}

/** Estado testável por administrador (sem reservar número oficial). */
export function podeTestarAdmin(estado: string | null | undefined): boolean {
  return normalizarEstado(estado) === "em_homologacao";
}

/** Nunca reserva número oficial fora de "homologado". */
export function podeReservarNumero(estado: string | null | undefined): boolean {
  return podeGerarOficial(estado);
}

export function rotuloEstado(estado: string | null | undefined): string {
  switch (normalizarEstado(estado)) {
    case "homologado": return "disponível";
    case "em_homologacao": return "Em homologação — não disponível para geração oficial.";
    case "aguardando_exemplar": return "Aguardando exemplar oficial — geração bloqueada.";
    default: return "Modelo bloqueado.";
  }
}
