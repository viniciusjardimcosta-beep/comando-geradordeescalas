import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Copy, Ban, FileText, History, Search } from "lucide-react";
import { toast } from "sonner";
import { baixarNbi, cancelarNbi, duplicarNbi, listarAuditoriaNbi } from "@/lib/nbi.functions";

export const Route = createFileRoute("/app/nbi/historico")({
  component: NbiHistoricoPage,
  head: () => ({
    meta: [
      { title: "Histórico de NBIs — Comando" },
      { name: "description", content: "Consulta, download, duplicação e cancelamento de NBIs emitidas." },
    ],
  }),
});

interface DocRow {
  id: string;
  numero: string | null;
  numero_int: number | null;
  ano: number | null;
  numero_ano_local: number | null;
  data_documento: string;
  titulo: string | null;
  status: string;
  storage_path: string | null;
  reserved_at: string | null;
  generated_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

function NbiHistoricoPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "rascunho" | "reservado" | "gerado" | "cancelado">("todos");
  const [anoFiltro, setAnoFiltro] = useState<string>("");
  const [auditDoc, setAuditDoc] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<Array<{ id: string; acao: string; detalhe: unknown; created_at: string }>>([]);

  const baixar = useServerFn(baixarNbi);
  const cancelar = useServerFn(cancelarNbi);
  const duplicar = useServerFn(duplicarNbi);
  const listarAud = useServerFn(listarAuditoriaNbi);

  useEffect(() => {
    if (!session?.user.id) return;
    void carregar();
  }, [session?.user.id]);

  async function carregar() {
    if (!session?.user.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("nbi_documents")
      .select("id,numero,numero_int,ano,numero_ano_local,data_documento,titulo,status,storage_path,reserved_at,generated_at,canceled_at,cancel_reason,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar histórico", { description: error.message });
    else setDocs((data ?? []) as DocRow[]);
    setLoading(false);
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return docs.filter((d) => {
      if (statusFiltro !== "todos" && d.status !== statusFiltro) return false;
      if (anoFiltro && String(d.numero_ano_local ?? d.ano ?? "") !== anoFiltro) return false;
      if (!q) return true;
      const hay = `${d.numero ?? ""} ${d.titulo ?? ""} ${d.data_documento}`.toLowerCase();
      return hay.includes(q);
    });
  }, [docs, busca, statusFiltro, anoFiltro]);

  const anos = useMemo(() => {
    const s = new Set<number>();
    for (const d of docs) if (d.numero_ano_local) s.add(d.numero_ano_local);
    return Array.from(s).sort((a, b) => b - a);
  }, [docs]);

  async function handleBaixar(id: string) {
    try {
      const r = await baixar({ data: { documento_id: id } });
      if (r.ok) window.open(r.url, "_blank");
    } catch (e) {
      toast.error("Erro ao baixar", { description: (e as Error).message });
    }
  }
  async function handleDuplicar(id: string) {
    try {
      const r = await duplicar({ data: { documento_id: id } });
      if (r.ok) {
        toast.success("Rascunho duplicado");
        navigate({ to: "/app/nbi/nova", search: { rascunho: r.id } });
      }
    } catch (e) {
      toast.error("Erro ao duplicar", { description: (e as Error).message });
    }
  }
  async function handleCancelar(id: string) {
    const motivo = window.prompt("Motivo do cancelamento (obrigatório):");
    if (!motivo || !motivo.trim()) return;
    if (!window.confirm("Confirmar cancelamento? O número, o arquivo e o snapshot serão preservados.")) return;
    try {
      await cancelar({ data: { documento_id: id, motivo } });
      toast.success("NBI cancelada");
      void carregar();
    } catch (e) {
      toast.error("Erro ao cancelar", { description: (e as Error).message });
    }
  }
  async function abrirAuditoria(id: string) {
    setAuditDoc(id);
    setAuditRows([]);
    try {
      const r = await listarAud({ data: { documento_id: id } });
      setAuditRows(r as never);
    } catch (e) {
      toast.error("Erro ao carregar auditoria", { description: (e as Error).message });
    }
  }

  function statusBadge(s: string) {
    const cfg: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      rascunho: { v: "secondary", label: "Rascunho" },
      reservado: { v: "outline", label: "Número reservado" },
      gerado: { v: "default", label: "Gerada" },
      cancelado: { v: "destructive", label: "Cancelada" },
    };
    const c = cfg[s] ?? { v: "secondary" as const, label: s };
    return <Badge variant={c.v}>{c.label}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6" /> Histórico de NBIs</h1>
          <p className="text-sm text-muted-foreground">Consulta, download, duplicação, cancelamento e auditoria.</p>
        </div>
        <Link to="/app/nbi/nova"><Button size="sm"><FileText className="mr-1 h-4 w-4" /> Nova NBI</Button></Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Combine texto, status e ano.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Número, título, data…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="todos">Todos os status</option>
            <option value="rascunho">Rascunhos</option>
            <option value="reservado">Número reservado</option>
            <option value="gerado">Geradas</option>
            <option value="cancelado">Canceladas</option>
          </select>
          <select
            value={anoFiltro}
            onChange={(e) => setAnoFiltro(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todos os anos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma NBI encontrada.</div>
          ) : (
            <div className="divide-y">
              {filtrados.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-[80px] font-mono text-sm">
                    {d.numero_int ? `${String(d.numero_int).padStart(3, "0")}/${d.numero_ano_local ?? d.ano}` : "s/nº"}
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-medium">{d.titulo ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Data: {new Date(d.data_documento + "T00:00:00").toLocaleDateString("pt-BR")}
                      {d.generated_at && ` · Gerada em ${new Date(d.generated_at).toLocaleString("pt-BR")}`}
                      {d.canceled_at && ` · Cancelada em ${new Date(d.canceled_at).toLocaleString("pt-BR")}`}
                    </div>
                    {d.cancel_reason && <div className="text-xs text-destructive">Motivo: {d.cancel_reason}</div>}
                  </div>
                  <div>{statusBadge(d.status)}</div>
                  <div className="flex flex-wrap gap-1">
                    {d.storage_path && (
                      <Button size="sm" variant="outline" onClick={() => handleBaixar(d.id)}>
                        <Download className="mr-1 h-4 w-4" /> Baixar
                      </Button>
                    )}
                    {d.status === "rascunho" && (
                      <Link to="/app/nbi/nova" search={{ rascunho: d.id }}>
                        <Button size="sm" variant="outline"><FileText className="mr-1 h-4 w-4" /> Abrir</Button>
                      </Link>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDuplicar(d.id)}>
                      <Copy className="mr-1 h-4 w-4" /> Duplicar
                    </Button>
                    {d.status !== "cancelado" && (
                      <Button size="sm" variant="ghost" onClick={() => handleCancelar(d.id)}>
                        <Ban className="mr-1 h-4 w-4 text-destructive" /> Cancelar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => abrirAuditoria(d.id)}>
                      Auditoria
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {auditDoc && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Auditoria do documento</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setAuditDoc(null)}>Fechar</Button>
            </div>
          </CardHeader>
          <CardContent>
            {auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem eventos.</p>
            ) : (
              <div className="divide-y text-sm">
                {auditRows.map((r) => (
                  <div key={r.id} className="py-2">
                    <div className="flex justify-between">
                      <span className="font-medium capitalize">{r.acao}</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    {r.detalhe != null && (
                      <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(r.detalhe, null, 2)}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
