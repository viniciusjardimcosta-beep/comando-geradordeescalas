// Bloco 10D — Painel de integridade pré-geração (somente leitura).
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ResultadoAuditoria, StatusAuditoria } from "@/lib/nbi/auditoria";

function Icone({ status }: { status: StatusAuditoria }) {
  if (status === "erro") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "alerta") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
}

export function PainelAuditoria({ resultado }: { resultado: ResultadoAuditoria }) {
  return (
    <div className="rounded-md border p-3 text-sm" data-testid="painel-auditoria">
      <div className="mb-2 font-semibold">Auditoria pré-geração</div>
      <ul className="space-y-1">
        {resultado.grupos.map((g) => (
          <li key={g.chave} data-testid={`auditoria-grupo-${g.chave}`} data-status={g.status}>
            <div className="flex items-center gap-2">
              <Icone status={g.status} />
              <span className={g.status === "erro" ? "font-medium text-destructive" : "font-medium"}>{g.titulo}</span>
            </div>
            {g.status !== "ok" && (
              <ul className="ml-6 list-disc pl-2 text-xs text-muted-foreground">
                {g.itens.map((i, idx) => (
                  <li key={idx} className={i.status === "erro" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
                    {i.mensagem}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {resultado.bloqueado && (
        <p className="mt-2 text-xs font-medium text-destructive">
          Existem erros bloqueantes — a geração e a reserva de número estão desabilitadas.
        </p>
      )}
    </div>
  );
}
