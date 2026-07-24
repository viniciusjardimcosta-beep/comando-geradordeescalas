// Dicionário militar fixo + montagem dinâmica a partir do banco.
// Palavras aqui NUNCA são marcadas como erro pelo corretor.

export const DICIONARIO_MILITAR_FIXO: readonly string[] = [
  // Quadros
  "QPBM", "QTBM", "QOEM", "QOBM", "QOSBM", "QOA",
  // Unidades / abreviações organizacionais
  "PelBM", "CiaBM", "BBM", "CBMRS", "CBM", "SBM", "BM",
  // Documentos e identificadores
  "ID", "FUNC", "BI", "NBI", "OBM",
  // Postos e graduações (abreviaturas comuns)
  "Sd", "Cb", "Sgt", "St", "Ten", "Cap", "Maj", "Cel",
  "1º", "2º", "3º", "4º",
  "1o", "2o", "3o", "4o",
  // Palavras militares recorrentes
  "efetivo", "guarnição", "guarnicao", "quartel", "corporação", "corporacao",
  "subunidade", "batalhão", "batalhao", "pelotão", "pelotao", "companhia",
  "escala", "plantão", "plantao", "expediente", "comissão", "comissao",
];

export interface FontesDinamicas {
  militaresNome?: Array<string | null | undefined>;
  militaresNomeGuerra?: Array<string | null | undefined>;
  lotacoes?: Array<string | null | undefined>;
  cabecalho?: {
    estado?: string | null;
    secretaria?: string | null;
    corporacao?: string | null;
    batalhao?: string | null;
    subunidade?: string | null;
    cidade?: string | null;
    unidade_nome?: string | null;
    unidade_sigla?: string | null;
  } | null;
}

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[\s\-/.,;:()]+/).filter((t) => t.length > 0);
}

// Monta o Set de palavras (case-sensitive e uma versão minúscula)
// combinando o dicionário fixo com dados dinâmicos do banco.
export function montarDicionarioDinamico(fontes: FontesDinamicas): Set<string> {
  const set = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (!v) return;
    for (const t of tokens(v)) {
      set.add(t);
      set.add(t.toLowerCase());
    }
  };

  for (const p of DICIONARIO_MILITAR_FIXO) {
    set.add(p);
    set.add(p.toLowerCase());
  }

  fontes.militaresNome?.forEach(add);
  fontes.militaresNomeGuerra?.forEach(add);
  fontes.lotacoes?.forEach(add);

  const c = fontes.cabecalho;
  if (c) {
    add(c.estado);
    add(c.secretaria);
    add(c.corporacao);
    add(c.batalhao);
    add(c.subunidade);
    add(c.cidade);
    add(c.unidade_nome);
    add(c.unidade_sigla);
  }

  return set;
}
