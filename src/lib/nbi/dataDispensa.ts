// Bloco 10C — Resolução da DATA DA DISPENSA com prioridade explícita.
//
// Ordem obrigatória:
//   1. data_fim_prevista da substituição;
//   2. data_fim das férias vinculadas do titular + 1 dia;
//   3. snapshot da Assunção (data_fim registrada no documento de origem);
//   4. manual — somente quando nenhuma fonte existe.
//
// A origem é devolvida junto do valor para ser exibida no CampoDerivado
// e gravada no snapshot de auditoria.

import { somarDiasISO, formatarDataBR } from "@/utils/nbi";
import type { OrigemDado } from "./derivados";

export type FonteDataDispensa =
  | "substituicao_prevista"
  | "ferias_titular"
  | "snapshot_assuncao"
  | "manual";

export interface ResultadoDataDispensa {
  valor: string;                 // ISO yyyy-mm-dd ("" quando não há fonte)
  fonte: FonteDataDispensa;
  origem: OrigemDado;
  detalhe: string;
}

export interface SubstituicaoParaData {
  id: string;
  titular_militar_id: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
}

export interface FeriasParaData {
  militar_id: string;
  data_inicio: string;
  data_fim: string;
}

export function resolverDataDispensa(
  s: SubstituicaoParaData,
  ferias: FeriasParaData[],
  snapshotAssuncao?: { DATA_FIM?: string | null; DATA_DISPENSA_PREVISTA?: string | null } | null,
): ResultadoDataDispensa {
  // 1. Prevista na própria substituição.
  if (s.data_fim_prevista) {
    return {
      valor: s.data_fim_prevista,
      fonte: "substituicao_prevista",
      origem: "Assunção anterior",
      detalhe: `Data prevista na assunção (${formatarDataBR(s.data_fim_prevista)})`,
    };
  }

  // 2. Férias vinculadas do titular — dia seguinte ao término.
  if (s.titular_militar_id) {
    const candidatas = ferias
      .filter((f) => f.militar_id === s.titular_militar_id)
      .filter((f) => !s.data_inicio || f.data_fim >= s.data_inicio)
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
    const f = candidatas[0];
    if (f) {
      return {
        valor: somarDiasISO(f.data_fim, 1),
        fonte: "ferias_titular",
        origem: "Banco de Férias",
        detalhe: `Dia seguinte ao término das férias do titular (${formatarDataBR(f.data_fim)})`,
      };
    }
  }

  // 3. Snapshot da assunção de origem.
  const doSnap = (snapshotAssuncao?.DATA_DISPENSA_PREVISTA || snapshotAssuncao?.DATA_FIM || "").trim();
  if (doSnap && /^\d{4}-\d{2}-\d{2}$/.test(doSnap)) {
    return {
      valor: doSnap,
      fonte: "snapshot_assuncao",
      origem: "Assunção anterior",
      detalhe: `Registrada no snapshot da assunção (${formatarDataBR(doSnap)})`,
    };
  }

  // 4. Nenhuma fonte — preenchimento manual obrigatório.
  return {
    valor: "",
    fonte: "manual",
    origem: "Assunção anterior",
    detalhe: "Nenhuma fonte automática disponível — informe manualmente",
  };
}
