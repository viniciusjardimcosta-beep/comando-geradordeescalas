// Bloco 12 — Consistência institucional de um assunto (Etapa 2 do wizard).
// Memoizado: só recalcula quando os dados relevantes mudam — sem loop de render.
import { memo, useMemo } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { avaliarConsistenciaNbi } from "@/lib/nbi/consistencia";
import type { Achado, BaseConsistencia } from "@/lib/nbi/consistencia";

interface Props {
  base: BaseConsistencia;
  militarId: string | null;
  militarTitularId?: string | null;
  substituicaoId?: string | null;
  tipoAssunto: string;
  subtipo?: string | null;
  campos: Record<string, string | boolean>;
  dataDocumento: string;
  documentoId?: string | null;
}

function Linha({ a }: { a: Achado }) {
  const Icone = a.severidade === "bloqueio" ? XCircle : a.severidade === "alerta" ? AlertTriangle : Lightbulb;
  const cor = a.severidade === "bloqueio"
    ? "text-destructive"
    : a.severidade === "alerta"
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";
  return (
    <li className="flex gap-2" data-testid="achado-consistencia" data-severidade={a.severidade} data-regra={a.regra}>
      <Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cor}`} />
      <div className="text-xs">
        <p className={`font-medium ${cor}`}>{a.titulo}</p>
        <p className="text-muted-foreground">{a.motivo}</p>
        <p className="text-[11px] text-muted-foreground">
          Origem: {a.origem}
          {a.relacionados.length > 0 && ` · Relacionado: ${a.relacionados.map((r) => r.rotulo).join(", ")}`}
          {" · "}Ação sugerida: {a.acaoSugerida}
        </p>
      </div>
    </li>
  );
}

function ConsistenciaAssuntoBase(p: Props) {
  const chave = JSON.stringify(p.campos);
  const resultado = useMemo(
    () => avaliarConsistenciaNbi({
      militarId: p.militarId,
      tipoAssunto: p.tipoAssunto,
      subtipo: p.subtipo ?? null,
      campos: p.campos,
      dataDocumento: p.dataDocumento,
      documentoId: p.documentoId ?? null,
      substituicaoId: p.substituicaoId ?? null,
      militarTitularId: p.militarTitularId ?? null,
      base: p.base,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.base, p.militarId, p.militarTitularId, p.substituicaoId, p.tipoAssunto, p.subtipo, chave, p.dataDocumento, p.documentoId],
  );

  const total = resultado.bloqueios.length + resultado.alertas.length + resultado.sugestoes.length;

  return (
    <div className="rounded-md border bg-muted/30 p-3" data-testid="consistencia-institucional">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Consistência institucional
      </div>
      {total === 0 ? (
        <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Sem conflitos identificados
        </p>
      ) : (
        <ul className="space-y-2">
          {[...resultado.bloqueios, ...resultado.alertas, ...resultado.sugestoes].map((a, i) => (
            <Linha key={`${a.regra}-${i}`} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

export const ConsistenciaAssunto = memo(ConsistenciaAssuntoBase);
