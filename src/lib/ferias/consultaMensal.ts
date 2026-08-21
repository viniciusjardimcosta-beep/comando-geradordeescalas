// Banco de Férias — consulta por mês/ano.
// Funções PURAS e ISOLADAS. Nenhum motor de escala ou NBI depende deste arquivo.

export type ClassificacaoFerias =
  | "Integralmente no mês"
  | "Inicia no mês"
  | "Termina no mês"
  | "Abrange todo o mês";

export interface PeriodoFerias {
  id: string;
  militar_id: string;
  ano: number;
  periodo: number;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string; // YYYY-MM-DD
}

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Quantidade de dias do mês (mes: 1-12), considerando ano bissexto. */
export function diasNoMesFerias(mes: number, ano: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Primeiro dia do mês em ISO (YYYY-MM-DD). */
export function primeiroDiaDoMes(mes: number, ano: number): string {
  return `${ano}-${pad(mes)}-01`;
}

/** Último dia do mês em ISO (YYYY-MM-DD). */
export function ultimoDiaDoMes(mes: number, ano: number): string {
  return `${ano}-${pad(mes)}-${pad(diasNoMesFerias(mes, ano))}`;
}

/** Verdadeiro quando o período tem interseção com o mês pesquisado. */
export function periodoIntersectaMes(
  periodo: Pick<PeriodoFerias, "data_inicio" | "data_fim">,
  mes: number,
  ano: number,
): boolean {
  const ini = primeiroDiaDoMes(mes, ano);
  const fim = ultimoDiaDoMes(mes, ano);
  return periodo.data_inicio <= fim && periodo.data_fim >= ini;
}

function toUTC(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, (m ?? 1) - 1, d ?? 1);
}

/** Quantidade de dias do período que caem dentro do mês pesquisado (inclusivo). */
export function diasDentroDoMes(
  periodo: Pick<PeriodoFerias, "data_inicio" | "data_fim">,
  mes: number,
  ano: number,
): number {
  if (!periodoIntersectaMes(periodo, mes, ano)) return 0;
  const ini = Math.max(toUTC(periodo.data_inicio), toUTC(primeiroDiaDoMes(mes, ano)));
  const fim = Math.min(toUTC(periodo.data_fim), toUTC(ultimoDiaDoMes(mes, ano)));
  return Math.floor((fim - ini) / 86_400_000) + 1;
}

/** Classificação apenas para exibição. */
export function classificarPeriodo(
  periodo: Pick<PeriodoFerias, "data_inicio" | "data_fim">,
  mes: number,
  ano: number,
): ClassificacaoFerias {
  const ini = primeiroDiaDoMes(mes, ano);
  const fim = ultimoDiaDoMes(mes, ano);
  const comecaAntes = periodo.data_inicio < ini;
  const terminaDepois = periodo.data_fim > fim;
  if (comecaAntes && terminaDepois) return "Abrange todo o mês";
  if (comecaAntes) return "Termina no mês";
  if (terminaDepois) return "Inicia no mês";
  return "Integralmente no mês";
}

export interface MilitarResumo {
  id: string;
  nome: string;
  matricula: string | null;
  posto_graduacao: string | null;
}

export interface LinhaConsultaMensal {
  id: string;
  militarId: string;
  militarNome: string;
  matricula: string | null;
  postoGraduacao: string | null;
  periodo: number;
  dataInicio: string;
  dataFim: string;
  diasNoMes: number;
  classificacao: ClassificacaoFerias;
}

export interface ResultadoConsultaMensal {
  titulo: string;
  totalMilitares: number;
  totalPeriodos: number;
  linhas: LinhaConsultaMensal[];
}

export function tituloConsulta(mes: number, ano: number): string {
  return `Férias em ${MESES_PT[mes - 1]} de ${ano}`;
}

/** Transformação exclusiva para visualização — não altera dados. */
export function montarResultadoMensal(
  periodos: PeriodoFerias[],
  militares: MilitarResumo[],
  mes: number,
  ano: number,
): ResultadoConsultaMensal {
  const porId = new Map(militares.map((m) => [m.id, m]));
  const linhas: LinhaConsultaMensal[] = periodos
    .filter((p) => periodoIntersectaMes(p, mes, ano))
    .map((p) => {
      const m = porId.get(p.militar_id);
      return {
        id: p.id,
        militarId: p.militar_id,
        militarNome: m?.nome ?? "Militar não encontrado",
        matricula: m?.matricula ?? null,
        postoGraduacao: m?.posto_graduacao ?? null,
        periodo: p.periodo,
        dataInicio: p.data_inicio,
        dataFim: p.data_fim,
        diasNoMes: diasDentroDoMes(p, mes, ano),
        classificacao: classificarPeriodo(p, mes, ano),
      };
    })
    .sort(
      (a, b) =>
        a.dataInicio.localeCompare(b.dataInicio) ||
        a.militarNome.localeCompare(b.militarNome, "pt-BR") ||
        a.periodo - b.periodo,
    );

  return {
    titulo: tituloConsulta(mes, ano),
    totalMilitares: new Set(linhas.map((l) => l.militarId)).size,
    totalPeriodos: linhas.length,
    linhas,
  };
}

/** Formata YYYY-MM-DD como DD/MM/AAAA (exibição). */
export function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
