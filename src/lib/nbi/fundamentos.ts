// Bloco 10E — Fundamentos legais configuráveis por assunto.
// O administrador cadastra; o operador apenas seleciona quando aplicável.
// Nenhum texto oficial é inventado aqui.

export interface FundamentoLegal {
  id: string;
  codigo_assunto: string;
  titulo: string;
  texto_oficial: string;
  ativo: boolean;
  padrao: boolean;
}

export const SEM_FUNDAMENTO = "__sem_fundamento__";

export function fundamentosDoAssunto(
  codigoAssunto: string,
  lista: FundamentoLegal[],
): FundamentoLegal[] {
  return lista.filter((f) => f.ativo && f.codigo_assunto === codigoAssunto);
}

/**
 * O template exige fundamento apenas quando declara a chave FUNDAMENTO.
 * Nenhum assunto passa a pedir fundamento por causa do catálogo.
 */
export function assuntoUsaFundamento(camposTemplate: Array<{ chave: string }>): boolean {
  return camposTemplate.some((c) => c.chave === "FUNDAMENTO");
}

/**
 * Fundamento aplicado automaticamente: só quando houver exatamente um
 * fundamento padrão ativo para o assunto. Caso contrário, o operador escolhe.
 */
export function fundamentoAutomatico(
  codigoAssunto: string,
  lista: FundamentoLegal[],
): FundamentoLegal | null {
  const padroes = fundamentosDoAssunto(codigoAssunto, lista).filter((f) => f.padrao);
  return padroes.length === 1 ? padroes[0] : null;
}

/** Valor final do placeholder FUNDAMENTO (vazio = sem fundamento específico). */
export function resolverFundamento(
  codigoAssunto: string,
  lista: FundamentoLegal[],
  escolhaId: string | null | undefined,
): { id: string | null; texto: string } {
  if (escolhaId === SEM_FUNDAMENTO) return { id: null, texto: "" };
  if (escolhaId) {
    const f = fundamentosDoAssunto(codigoAssunto, lista).find((x) => x.id === escolhaId);
    if (f) return { id: f.id, texto: f.texto_oficial };
  }
  const auto = fundamentoAutomatico(codigoAssunto, lista);
  return auto ? { id: auto.id, texto: auto.texto_oficial } : { id: null, texto: "" };
}
