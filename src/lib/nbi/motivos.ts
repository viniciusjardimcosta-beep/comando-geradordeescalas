// Motivos controlados de Assunção/Dispensa de função (Bloco 8C).
// Regra: o RÓTULO da interface NUNCA é reaproveitado dentro da frase oficial.
// Cada motivo declara o texto exato que entra em cada construção:
//   Assunção: "...encontrar-se em {texto_assuncao}."
//   Dispensa: "...retornou de {texto_dispensa}."

export interface MotivoNbi {
  id: string;
  /** Rótulo exibido na interface (pode ser descritivo). */
  label: string;
  /** Texto que entra na frase de assunção, após "encontrar-se em". */
  texto_assuncao: string;
  /** Texto que entra na frase de dispensa, após "retornou de". */
  texto_dispensa: string;
}

export const MOTIVOS_FUNCAO: MotivoNbi[] = [
  {
    id: "ferias",
    label: "Férias regulamentares",
    texto_assuncao: "férias regulamentares",
    texto_dispensa: "férias regulamentares",
  },
  {
    id: "paternidade",
    label: "Licença-paternidade",
    texto_assuncao: "licença-paternidade",
    texto_dispensa: "licença-paternidade",
  },
  {
    id: "luto",
    label: "Luto regulamentar",
    texto_assuncao: "luto regulamentar",
    texto_dispensa: "luto regulamentar",
  },
  {
    id: "lts",
    label: "Licença para tratamento de saúde",
    texto_assuncao: "licença para tratamento de saúde",
    texto_dispensa: "licença para tratamento de saúde",
  },
  {
    id: "curso",
    label: "Curso",
    texto_assuncao: "curso",
    texto_dispensa: "curso",
  },
  {
    id: "nupcias",
    label: "Núpcias",
    texto_assuncao: "núpcias regulamentares",
    texto_dispensa: "núpcias regulamentares",
  },
];

/** Texto oficial do motivo para o contexto pedido. */
export function textoMotivo(id: string, contexto: "afastamento" | "retorno"): string | null {
  const m = MOTIVOS_FUNCAO.find((x) => x.id === id);
  if (!m) return null;
  return contexto === "afastamento" ? m.texto_assuncao : m.texto_dispensa;
}

/** Descobre o motivo a partir do texto já gravado (para reabrir rascunhos). */
export function motivoPorTexto(texto: string, contexto: "afastamento" | "retorno"): MotivoNbi | null {
  const alvo = texto.trim().toLowerCase();
  return (
    MOTIVOS_FUNCAO.find((m) =>
      (contexto === "afastamento" ? m.texto_assuncao : m.texto_dispensa).toLowerCase() === alvo,
    ) ?? null
  );
}

/** Texto de férias regulamentares — usado pelo preenchimento automático. */
export const TEXTO_FERIAS = "férias regulamentares";
