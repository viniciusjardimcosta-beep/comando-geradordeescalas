// Bloco 12G — separação entre DUPLICIDADE DOCUMENTAL e INCOMPATIBILIDADE INSTITUCIONAL.
// Camada PURA: nada aqui consulta banco, grava dados ou gera documentos.
//
// Duplicidade documental = "já existe outra NBI equivalente sobre o mesmo fato".
//   → o operador pode prosseguir MEDIANTE CONFIRMAÇÃO EXPLÍCITA.
// Incompatibilidade institucional = os dados tornam a nova NBI impossível/incoerente
//   (datas impossíveis, apresentação antes do fim do afastamento, substituição
//   encerrada, documento de origem cancelado, campos obrigatórios ausentes).
//   → permanece BLOQUEANTE, sem qualquer via de confirmação.

import type { Achado } from "./consistencia/tipos";

/**
 * Lista FECHADA de regras cuja única causa é a existência de um documento
 * anterior equivalente. Nenhuma outra regra pode entrar aqui sem autorização
 * institucional explícita.
 */
export const REGRAS_DUPLICIDADE_DOCUMENTAL: readonly string[] = [
  "apresentacao.duplicada",
  "redundancia.documento_ativo",
];

export function ehDuplicidadeDocumental(regra: string): boolean {
  return REGRAS_DUPLICIDADE_DOCUMENTAL.includes(regra);
}

export interface SeparacaoAchados {
  /** Confirmáveis: só existem porque há outra NBI equivalente. */
  duplicidadeDocumental: Achado[];
  /** Não confirmáveis: incompatibilidade real dos dados. */
  institucionais: Achado[];
}

/**
 * Separa bloqueios/alertas em duplicidade documental (confirmável) e
 * incompatibilidade institucional (bloqueante).
 */
export function separarAchados(achados: Achado[]): SeparacaoAchados {
  const duplicidadeDocumental: Achado[] = [];
  const institucionais: Achado[] = [];
  for (const a of achados) {
    if (ehDuplicidadeDocumental(a.regra)) duplicidadeDocumental.push(a);
    else institucionais.push(a);
  }
  return { duplicidadeDocumental, institucionais };
}

/**
 * Gate de geração: duplicidade documental bloqueia ATÉ confirmação explícita.
 * A confirmação NÃO reserva número — a reserva continua ocorrendo apenas no
 * fluxo normal de geração, imediatamente antes de emitir o documento.
 */
export function bloqueadoPorDuplicidade(
  duplicidades: readonly unknown[],
  confirmado: boolean,
): boolean {
  return duplicidades.length > 0 && !confirmado;
}

