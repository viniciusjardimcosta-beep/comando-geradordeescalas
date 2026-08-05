// Bloco 12 — Avaliação central de consistência institucional.
// FUNÇÃO PURA: recebe a base carregada em lote e devolve o resultado.
// Não altera banco, não reserva número, não modifica rascunho, não gera documento.

import type { EntradaConsistencia, ResultadoConsistencia, Achado, Relacionado } from "./tipos";
import {
  regrasApresentacao, regrasConflitoAfastamento, regrasCronologicas,
  regrasRedundancia, regrasSubstituicao,
} from "./regras";
import { sugestoesDoMilitar } from "./pendencias";
import { montarTimeline } from "./timeline";

export function avaliarConsistenciaNbi(e: EntradaConsistencia): ResultadoConsistencia {
  const achados: Achado[] = [
    ...regrasCronologicas(e),
    ...regrasSubstituicao(e),
    ...regrasConflitoAfastamento(e),
    ...regrasApresentacao(e),
    ...regrasRedundancia(e),
  ];
  if (e.militarId) achados.push(...sugestoesDoMilitar(e.base, e.militarId));

  const documentosRelacionados: Relacionado[] = [];
  const vistos = new Set<string>();
  for (const a of achados) {
    for (const r of a.relacionados) {
      if (r.tipo !== "documento" || vistos.has(r.id)) continue;
      vistos.add(r.id);
      documentosRelacionados.push(r);
    }
  }

  return {
    bloqueios: achados.filter((a) => a.severidade === "bloqueio"),
    alertas: achados.filter((a) => a.severidade === "alerta"),
    sugestoes: achados.filter((a) => a.severidade === "sugestao"),
    documentosRelacionados,
    linhaDoTempo: e.militarId
      ? montarTimeline(e.base, e.militarId, { porPagina: 20 }).eventos
      : [],
  };
}
