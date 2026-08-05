// Bloco 10D — Painel de integridade pré-geração do NBI.
// Função PURA: audita e classifica; nunca modifica dados, snapshot ou banco.
// Nenhum texto oficial vive aqui.

export type StatusAuditoria = "ok" | "alerta" | "erro";

export interface ItemAuditoria {
  status: StatusAuditoria;
  mensagem: string;
}

export interface GrupoAuditoria {
  chave: string;
  titulo: string;
  status: StatusAuditoria;
  itens: ItemAuditoria[];
}

export interface AssuntoAuditavel {
  titulo: string;
  militar: string | null;
  titular?: string | null;
  exigeTitular?: boolean;
  /** Pendências já calculadas pelos motores (bloqueantes). */
  pendencias: string[];
  /** Placeholders não substituídos no texto final. */
  ausentes: string[];
  /** Texto final renderizado do item. */
  texto: string;
  /** Substituição encerrada sendo reutilizada. */
  substituicaoEncerrada?: boolean;
}

export interface EntradaAuditoria {
  assuntos: AssuntoAuditavel[];
  duplicados: string[];
  divergenciasAno: string[];
  cabecalhoOk: boolean;
  digitadorOk: boolean;
  comandanteOk: boolean;
  numeracaoOk: boolean;
  /** Bloco 12 — achados do motor de consistência institucional. */
  consistencia?: ItemAuditoria[];
}


export interface ResultadoAuditoria {
  grupos: GrupoAuditoria[];
  erros: number;
  alertas: number;
  bloqueado: boolean;
}

/** Resíduos técnicos que jamais podem chegar ao documento oficial. */
const RESIDUOS: Array<[RegExp, string]> = [
  [/\{\{[^}]*\}\}/, "placeholder não substituído"],
  [/\bundefined\b/, 'ocorrência de "undefined"'],
  [/\bnull\b/, 'ocorrência de "null"'],
  [/\bTBD\b|\ba definir\b|texto provis[óo]rio/i, "texto provisório"],
];

function pior(a: StatusAuditoria, b: StatusAuditoria): StatusAuditoria {
  if (a === "erro" || b === "erro") return "erro";
  if (a === "alerta" || b === "alerta") return "alerta";
  return "ok";
}

function grupo(chave: string, titulo: string, itens: ItemAuditoria[], okMsg: string): GrupoAuditoria {
  if (itens.length === 0) {
    return { chave, titulo, status: "ok", itens: [{ status: "ok", mensagem: okMsg }] };
  }
  return { chave, titulo, status: itens.reduce((s, i) => pior(s, i.status), "ok" as StatusAuditoria), itens };
}

/** Classifica uma pendência de motor no grupo institucional correspondente. */
function grupoDaPendencia(p: string): "militares" | "institucional" | "datas" | "redacoes" {
  const t = p.toLowerCase();
  if (/lota[çc][ãa]o|fun[çc][ãa]o|quadro|posto|g[êe]nero/.test(t)) return "institucional";
  if (/data|per[íi]odo|dias|ano/.test(t)) return "datas";
  if (/militar|titular|id func|matr[íi]cula/.test(t)) return "militares";
  return "redacoes";
}

export function auditarPreGeracao(e: EntradaAuditoria): ResultadoAuditoria {
  const buckets: Record<string, ItemAuditoria[]> = {
    militares: [], institucional: [], datas: [], substituicoes: [],
    redacoes: [], ortografia: [], assinaturas: [], numeracao: [], consistencia: [],
  };

  for (const a of e.assuntos) {
    const prefixo = a.titulo;
    if (!a.militar) buckets.militares.push({ status: "erro", mensagem: `${prefixo}: militar não selecionado` });
    if (a.exigeTitular && !a.titular) {
      buckets.militares.push({ status: "erro", mensagem: `${prefixo}: titular da função não selecionado` });
    }
    for (const p of a.pendencias) {
      buckets[grupoDaPendencia(p)].push({ status: "erro", mensagem: `${prefixo}: ${p}` });
    }
    for (const ph of a.ausentes) {
      buckets.redacoes.push({ status: "erro", mensagem: `${prefixo}: placeholder não substituído (${ph})` });
    }
    if (!a.texto.trim()) {
      buckets.redacoes.push({ status: "erro", mensagem: `${prefixo}: texto oficial indisponível` });
    } else {
      for (const [re, motivo] of RESIDUOS) {
        if (re.test(a.texto)) {
          buckets.redacoes.push({ status: "erro", mensagem: `${prefixo}: ${motivo}` });
          break;
        }
      }
    }
    if (a.substituicaoEncerrada) {
      buckets.substituicoes.push({ status: "erro", mensagem: `${prefixo}: substituição já encerrada não pode ser reutilizada` });
    }
  }

  for (const d of e.duplicados) {
    buckets.substituicoes.push({ status: "erro", mensagem: `Assunto duplicado: ${d}` });
  }
  for (const d of e.divergenciasAno) {
    buckets.datas.push({ status: "alerta", mensagem: `Data pertence a outro ano — confirme para continuar (${d})` });
  }
  if (!e.cabecalhoOk) {
    buckets.institucional.push({ status: "erro", mensagem: "Cabeçalho institucional incompleto nas Configurações NBI" });
  }
  if (!e.digitadorOk) buckets.assinaturas.push({ status: "erro", mensagem: "Digitador não configurado" });
  if (!e.comandanteOk) buckets.assinaturas.push({ status: "erro", mensagem: "Comandante não configurado" });
  for (const item of e.consistencia ?? []) buckets.consistencia.push(item);
  if (!e.numeracaoOk) buckets.numeracao.push({ status: "erro", mensagem: "Numeração indisponível para este documento" });

  const grupos: GrupoAuditoria[] = [
    grupo("militares", "Dados dos militares", buckets.militares, "Militares e titulares localizados"),
    grupo("institucional", "Dados institucionais", buckets.institucional, "Posto, quadro, lotação, função e cabeçalho válidos"),
    grupo("datas", "Datas e cálculos", buckets.datas, "Datas válidas e cronologicamente coerentes"),
    grupo("substituicoes", "Substituições", buckets.substituicoes, "Nenhuma duplicidade nem substituição encerrada reutilizada"),
    grupo("redacoes", "Redações oficiais", buckets.redacoes, "Texto oficial disponível, sem placeholders nem resíduos"),
    grupo("ortografia", "Ortografia e topônimos", buckets.ortografia, "Topônimos e siglas institucionais validados"),
    grupo("assinaturas", "Assinaturas", buckets.assinaturas, "Digitador e comandante configurados"),
    grupo("numeracao", "Numeração", buckets.numeracao, "Numeração válida"),
    grupo("consistencia", "Consistência institucional", buckets.consistencia, "Sem conflitos institucionais identificados"),
  ];

  const erros = grupos.reduce((n, g) => n + g.itens.filter((i) => i.status === "erro").length, 0);
  const alertas = grupos.reduce((n, g) => n + g.itens.filter((i) => i.status === "alerta").length, 0);
  return { grupos, erros, alertas, bloqueado: erros > 0 };
}
