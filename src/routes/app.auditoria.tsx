import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { Loader2, ClipboardCheck, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  auditarEscalaXlsx,
  relatorioParaCsv,
  type RelatorioAuditoria,
} from "@/utils/auditoria-escala";

export const Route = createFileRoute("/app/auditoria")({
  component: AuditoriaPage,
});

interface EscalaGerada {
  id: string;
  mes: number;
  ano: number;
  arquivo_nome: string | null;
  arquivo_saida_path: string | null;
  status: string;
  created_at: string;
}

const meses = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function AuditoriaPage() {
  const { user } = useAuth();
  const [escalas, setEscalas] = useState<EscalaGerada[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditandoId, setAuditandoId] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioAuditoria | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("escalas_geradas")
        .select("id, mes, ano, arquivo_nome, arquivo_saida_path, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) toast.error(error.message);
      setEscalas((data ?? []) as EscalaGerada[]);
      setLoading(false);
    })();
  }, [user]);

  const auditar = async (esc: EscalaGerada) => {
    if (!esc.arquivo_saida_path) {
      toast.error("Esta escala não possui arquivo gerado.");
      return;
    }
    setAuditandoId(esc.id);
    setRelatorio(null);
    setExpandido(new Set());
    try {
      const { data, error } = await supabase.storage
        .from("escalas")
        .download(esc.arquivo_saida_path);
      if (error || !data) throw new Error(error?.message ?? "Falha ao baixar arquivo.");
      const buf = new Uint8Array(await data.arrayBuffer());
      const rel = auditarEscalaXlsx(buf, esc.mes, esc.ano);
      setRelatorio(rel);
      if (rel.alertasGlobais.length) {
        toast.warning(rel.alertasGlobais.join(" "));
      } else {
        toast.success(`Auditoria concluída: ${rel.militares.length} militar(es) analisado(s).`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha na auditoria: ${msg}`);
    } finally {
      setAuditandoId(null);
    }
  };

  const baixarCsv = () => {
    if (!relatorio) return;
    const csv = relatorioParaCsv(relatorio);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${relatorio.mes}-${relatorio.ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExp = (nome: string) => {
    const s = new Set(expandido);
    if (s.has(nome)) s.delete(nome);
    else s.add(nome);
    setExpandido(s);
  };

  const resumo = useMemo(() => {
    if (!relatorio) return null;
    const comDif = relatorio.militares.filter((m) => m.diferenca !== 0);
    return {
      total: relatorio.militares.length,
      comDif: comDif.length,
      ok: relatorio.militares.length - comDif.length,
    };
  }, [relatorio]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Auditoria de Escala</h1>
          <p className="text-sm text-muted-foreground">
            Diagnóstico passo a passo. Compara a carga prevista com a soma real
            de ORD, CM, EXP e HE de cada militar — célula a célula, dia a dia.
            <strong> Não altera nada na escala.</strong>
          </p>
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <h2 className="font-semibold text-sm">Escalas geradas</h2>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : escalas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma escala gerada.</p>
        ) : (
          <div className="space-y-2">
            {escalas.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2"
              >
                <div className="text-sm">
                  <span className="font-medium">
                    {meses[e.mes - 1]}/{e.ano}
                  </span>
                  {e.arquivo_nome && (
                    <span className="ml-2 text-muted-foreground">— {e.arquivo_nome}</span>
                  )}
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {e.status}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  onClick={() => auditar(e)}
                  disabled={!!auditandoId || !e.arquivo_saida_path}
                >
                  {auditandoId === e.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Auditar"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {relatorio && (
        <div className="panel p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">
                Relatório {meses[relatorio.mes - 1]}/{relatorio.ano}
              </span>
              {resumo && (
                <span className="ml-3 text-muted-foreground">
                  {resumo.total} militares · {resumo.ok} ok ·{" "}
                  <span className={resumo.comDif > 0 ? "text-destructive font-semibold" : ""}>
                    {resumo.comDif} com diferença
                  </span>
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={baixarCsv}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Militar</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead className="text-right">Carga</TableHead>
                  <TableHead className="text-right">ORD</TableHead>
                  <TableHead className="text-right">CM</TableHead>
                  <TableHead className="text-right">EXP</TableHead>
                  <TableHead className="text-right">HE</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dif</TableHead>
                  <TableHead>Causa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatorio.militares.map((m) => {
                  const isExp = expandido.has(m.nome);
                  const difClass =
                    m.diferenca === 0
                      ? "text-muted-foreground"
                      : "text-destructive font-semibold";
                  return (
                    <Fragment key={m.nome}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleExp(m.nome)}
                      >
                        <TableCell>
                          {isExp ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{m.nome}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.matricula}
                        </TableCell>
                        <TableCell className="text-right">{m.cargaPrevista}</TableCell>
                        <TableCell className="text-right">{m.horasOrdinarias}</TableCell>
                        <TableCell className="text-right">{m.horasCM}</TableCell>
                        <TableCell className="text-right">{m.horasEXP}</TableCell>
                        <TableCell className="text-right">{m.horasHE}</TableCell>
                        <TableCell className="text-right">{m.totalFinal}</TableCell>
                        <TableCell className={`text-right ${difClass}`}>
                          {m.diferenca > 0 ? `+${m.diferenca}` : m.diferenca}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.causas.map((c) => (
                              <Badge
                                key={c}
                                variant={c === "ok" ? "secondary" : "destructive"}
                                className="text-[10px]"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExp && (
                        <TableRow key={`${m.nome}-d`}>
                          <TableCell colSpan={11} className="bg-muted/30">
                            <div className="space-y-3 p-2">
                              <div className="text-xs">
                                <strong>Carga prevista:</strong> {m.cargaPrevista}h
                                {" "}
                                ({m.diasAfastado} dia(s) afastado(s)) ·{" "}
                                <strong>Total lançado:</strong> {m.totalFinal}h ·{" "}
                                <strong>Diferença:</strong>{" "}
                                <span className={difClass}>
                                  {m.diferenca > 0 ? `+${m.diferenca}` : m.diferenca}h
                                </span>
                              </div>
                              {m.detalhes.length > 0 && (
                                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs space-y-1">
                                  <div className="font-semibold text-destructive">
                                    Observações de diagnóstico:
                                  </div>
                                  {m.detalhes.map((d, i) => (
                                    <div key={i}>• {d}</div>
                                  ))}
                                </div>
                              )}
                              <div className="max-h-72 overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Dia</TableHead>
                                      <TableHead>Célula</TableHead>
                                      <TableHead>Linha</TableHead>
                                      <TableHead>Sigla</TableHead>
                                      <TableHead className="text-right">Horas</TableHead>
                                      <TableHead className="text-right">Acum.</TableHead>
                                      <TableHead>Obs</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {m.lancamentos.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                          Nenhum lançamento.
                                        </TableCell>
                                      </TableRow>
                                    ) : (
                                      m.lancamentos.map((l, i) => (
                                        <TableRow key={i}>
                                          <TableCell>{l.dia}</TableCell>
                                          <TableCell className="font-mono text-xs">{l.celula}</TableCell>
                                          <TableCell>{l.linha}</TableCell>
                                          <TableCell className="font-mono">{l.sigla}</TableCell>
                                          <TableCell className="text-right">{l.horas}</TableCell>
                                          <TableCell className="text-right">{l.acumulado}</TableCell>
                                          <TableCell className="text-xs text-muted-foreground">
                                            {l.observacao ?? ""}
                                          </TableCell>
                                        </TableRow>
                                      ))
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
