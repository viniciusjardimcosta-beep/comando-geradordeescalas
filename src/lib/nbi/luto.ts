// Bloco 11A — catálogo controlado do motivo do LUTO.
// O rótulo da interface nunca é reaproveitado dentro da frase oficial:
// cada grau declara o texto exato que entra após "visto Falecimento de".
// Nenhum texto oficial de modelo vive aqui (o modelo está em nbi_templates).

export interface GrauLuto {
  id: string;
  /** Rótulo exibido na interface. */
  label: string;
  /** Texto documental — entra após "visto Falecimento de". */
  texto: string;
}

export const GRAUS_LUTO: GrauLuto[] = [
  { id: "genitor", label: "Genitor", texto: "seu Genitor" },
  { id: "genitora", label: "Genitora", texto: "sua Genitora" },
  { id: "conjuge", label: "Cônjuge", texto: "seu Cônjuge" },
  { id: "filho", label: "Filho", texto: "seu Filho" },
  { id: "filha", label: "Filha", texto: "sua Filha" },
  { id: "irmao", label: "Irmão", texto: "seu Irmão" },
  { id: "irma", label: "Irmã", texto: "sua Irmã" },
];

/** Texto documental do grau escolhido. */
export function textoGrauLuto(id: string): string | null {
  return GRAUS_LUTO.find((g) => g.id === id)?.texto ?? null;
}

/** Descobre o grau a partir do texto já gravado (reabertura de rascunhos). */
export function grauPorTexto(texto: string): GrauLuto | null {
  const alvo = texto.trim().toLowerCase();
  return GRAUS_LUTO.find((g) => g.texto.toLowerCase() === alvo) ?? null;
}

/** Quantidade de dias padrão institucional do luto (exemplar oficial). */
export const DIAS_PADRAO_LUTO = 8;
