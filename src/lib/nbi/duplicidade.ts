// Bloco 10C — Detector de duplicidade com ASSINATURA ESPECÍFICA POR MOTOR.
// Um bloqueio genérico (assunto + militar + data) barra assuntos legítimos
// semelhantes (ex.: duas viagens no mesmo dia para destinos diferentes).
// Cada motor declara os campos que realmente identificam o fato administrativo.

/** Campos que compõem a identidade do fato, por código de motor. */
const ASSINATURA_POR_MOTOR: Record<string, string[]> = {
  // Férias: militar + período + ano identificam exatamente o fato.
  ferias: ["PERIODO", "ANO", "DATA_INICIO"],
  apresentacao: ["DATA_APRESENTACAO", "DATA_INICIO", "PERIODO"],
  // Viagem: destino e missão diferenciam viagens no mesmo dia.
  viagem: ["DATA_INICIO", "DESTINO", "ORIGEM", "MISSAO"],
  // Função: a função assumida/dispensada é o discriminante real.
  assuncao_funcao: ["DATA_INICIO", "FUNCAO_ASSUMIDA", "militar_titular_id"],
  dispensa_funcao: ["DATA_INICIO", "FUNCAO_DISPENSADA", "militar_titular_id", "substituicao_id"],
  // Serviço extraordinário: mês de referência + missão.
  servico_extraordinario: ["mes_referencia_sel", "DATA_INICIO", "MISSAO"],
  dispensa_recompensa: ["DATA_INICIO", "QTD_DIAS", "MOTIVO"],
  nomeacao_comissao: ["DATA_INICIO", "FINALIDADE", "COMPOSICAO"],
  licenca_paternidade: ["DATA_INICIO"],
};

/** Fallback usado por motores ainda não catalogados. */
const ASSINATURA_PADRAO = ["DATA_INICIO", "DATA_FIM", "MOTIVO"];

export interface AssuntoAssinavel {
  id: string;
  tipo: string;
  militar_id: string | null;
  militar_titular_id?: string | null;
  substituicao_id?: string | null;
  campos: Record<string, string | boolean>;
}

/** Assinatura textual de um assunto — igualdade = duplicidade real. */
export function assinaturaDeAssunto(a: AssuntoAssinavel): string {
  const chaves = ASSINATURA_POR_MOTOR[a.tipo] ?? ASSINATURA_PADRAO;
  const partes: string[] = [a.tipo, a.militar_id ?? ""];
  for (const k of chaves) {
    let v: unknown;
    if (k === "militar_titular_id") v = a.militar_titular_id ?? "";
    else if (k === "substituicao_id") v = a.substituicao_id ?? "";
    else v = a.campos[k];
    partes.push(String(v ?? "").trim().toLowerCase());
  }
  return partes.join("|");
}

export interface Duplicidade {
  assinatura: string;
  indices: number[];
}

/** Localiza grupos de assuntos com assinatura idêntica. */
export function detectarDuplicidades(assuntos: AssuntoAssinavel[]): Duplicidade[] {
  const grupos = new Map<string, number[]>();
  assuntos.forEach((a, i) => {
    const sig = assinaturaDeAssunto(a);
    const arr = grupos.get(sig) ?? [];
    arr.push(i);
    grupos.set(sig, arr);
  });
  return [...grupos.entries()]
    .filter(([, ix]) => ix.length > 1)
    .map(([assinatura, indices]) => ({ assinatura, indices }));
}
