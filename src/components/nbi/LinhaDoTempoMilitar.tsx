// Bloco 12 — Linha do tempo documental do militar (componente reutilizável).
// Somente leitura, com recorte por período e paginação.
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarDataBR } from "@/utils/nbi";
import { montarTimeline } from "@/lib/nbi/consistencia";
import type { BaseConsistencia } from "@/lib/nbi/consistencia";

interface Props {
  base: BaseConsistencia;
  militarId: string;
  porPagina?: number;
  compacto?: boolean;
}

export function LinhaDoTempoMilitar({ base, militarId, porPagina = 15, compacto = false }: Props) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(1);

  const resultado = useMemo(
    () => montarTimeline(base, militarId, { de: de || null, ate: ate || null, pagina, porPagina }),
    [base, militarId, de, ate, pagina, porPagina],
  );

  const totalPaginas = Math.max(1, Math.ceil(resultado.total / resultado.porPagina));

  return (
    <div className="rounded-md border p-3 text-sm" data-testid="linha-do-tempo">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">Linha do tempo documental</span>
        <Badge variant="secondary">{resultado.total} evento(s)</Badge>
        {!compacto && (
          <div className="ml-auto flex items-center gap-2">
            <Input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} className="h-8 w-[9.5rem]" aria-label="Período inicial" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} className="h-8 w-[9.5rem]" aria-label="Período final" />
          </div>
        )}
      </div>

      {resultado.eventos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum evento documental no período.</p>
      ) : (
        <ol className="space-y-2">
          {resultado.eventos.map((ev) => (
            <li key={ev.chave} data-testid="timeline-evento" data-tipo={ev.tipo} data-situacao={ev.situacao} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ev.assunto}</span>
                {ev.numeroNbi && <Badge variant="outline">{ev.numeroNbi}</Badge>}
                {ev.situacao === "cancelado" && <Badge variant="destructive">cancelado</Badge>}
                {ev.situacao === "reservado" && <Badge variant="secondary">reservado (não publicado)</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatarDataBR(ev.data)}{ev.dataFim && ev.dataFim !== ev.data ? ` a ${formatarDataBR(ev.dataFim)}` : ""}
                {ev.vinculo ? ` · ${ev.vinculo}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">Origem: {ev.origem}</p>
            </li>
          ))}
        </ol>
      )}

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span>Página {resultado.pagina} de {totalPaginas}</span>
          <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
