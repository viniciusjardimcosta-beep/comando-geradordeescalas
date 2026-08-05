// Bloco 10E — Funções por integrante da comissão.
// Regras estruturais apenas: a redação oficial continua em nbi_templates.

export type FuncaoComissao = "presidente" | "membro" | "secretario" | "relator" | "outra";

export const FUNCOES_COMISSAO: Array<{ id: FuncaoComissao; label: string }> = [
  { id: "presidente", label: "Presidente" },
  { id: "membro", label: "Membro" },
  { id: "secretario", label: "Secretário" },
  { id: "relator", label: "Relator" },
  { id: "outra", label: "Outra função confirmada" },
];

export function rotuloFuncao(f: FuncaoComissao | undefined | null, outra?: string | null): string {
  if (f === "outra") return (outra ?? "").trim() || "Outra função";
  return FUNCOES_COMISSAO.find((x) => x.id === f)?.label ?? "Membro";
}

export interface IntegranteFuncao {
  funcao?: FuncaoComissao | null;
  funcao_outra?: string | null;
}

/** Primeiro integrante é sugerido como Presidente; os demais, Membros. */
export function funcaoSugerida(indice: number): FuncaoComissao {
  return indice === 0 ? "presidente" : "membro";
}

export function funcaoEfetiva(i: IntegranteFuncao, indice: number): FuncaoComissao {
  return i.funcao ?? funcaoSugerida(indice);
}

/**
 * A variante especial (Secretário/Relator/outra) tem redação própria e ainda
 * não possui exemplar oficial: só a comissão padrão é homologada.
 */
export function exigeVarianteEspecial(integrantes: IntegranteFuncao[]): boolean {
  return integrantes.some((i, idx) => {
    const f = funcaoEfetiva(i, idx);
    return f === "secretario" || f === "relator" || f === "outra";
  });
}

export function codigoTemplateComissao(integrantes: IntegranteFuncao[]): string {
  return exigeVarianteEspecial(integrantes) ? "nomeacao_comissao_funcoes" : "nomeacao_comissao";
}

/** Validação estrutural da composição (Presidente único obrigatório). */
export function validarFuncoesComissao(
  integrantes: IntegranteFuncao[],
  opts: { confirmarDoisPresidentes?: boolean } = {},
): string[] {
  const out: string[] = [];
  if (integrantes.length === 0) return out;
  const presidentes = integrantes.filter((i, idx) => funcaoEfetiva(i, idx) === "presidente");
  if (presidentes.length === 0) {
    out.push("comissão sem Presidente: exatamente um integrante deve ser o Presidente");
  } else if (presidentes.length > 1 && !opts.confirmarDoisPresidentes) {
    out.push(
      `comissão com ${presidentes.length} Presidentes: confirme administrativamente ou ajuste as funções`,
    );
  }
  integrantes.forEach((i, idx) => {
    if (funcaoEfetiva(i, idx) === "outra" && !String(i.funcao_outra ?? "").trim()) {
      out.push(`${idx + 1}º integrante: descreva a outra função confirmada`);
    }
  });
  return out;
}
