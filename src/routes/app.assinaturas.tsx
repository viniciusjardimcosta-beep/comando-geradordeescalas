import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/assinaturas")({
  component: AssinaturasAdminPage,
});

type ProfileRow = {
  id: string;
  email: string;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  plano_nome: string | null;
  subscription_status: string;
  subscription_identifier: string | null;
  subscription_provider: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  trial_end_date: string | null;
  created_at: string;
};

type NexanoRow = {
  id: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_cpf: string | null;
  customer_phone: string | null;
  subscription_identifier: string;
  subscription_external_id: string | null;
  subscription_status: string;
  start_at: string | null;
  end_at: string | null;
  product_name: string | null;
  offer_code: string | null;
  last_transaction_id: string | null;
  last_transaction_identifier: string | null;
  last_event_type: string | null;
  updated_at: string;
  created_at: string;
};

type BillingEvent = {
  id: string;
  provider: string;
  event_id: string | null;
  event_type: string | null;
  status: string;
  customer_email: string | null;
  external_id: string | null;
  source_ip: string | null;
  headers: Record<string, unknown>;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "ativos", label: "Ativos" },
  { key: "cancelados", label: "Cancelados" },
  { key: "refunded", label: "Refunded" },
  { key: "expirados", label: "Expirados" },
  { key: "trial", label: "Em teste" },
  { key: "sem", label: "Sem assinatura" },
] as const;

type FiltroKey = typeof FILTROS[number]["key"];

const PAGE_SIZE = 25;

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return "—"; }
}
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return "—"; }
}
function fmtMoneyCents(v: unknown) {
  if (typeof v !== "number") return "—";
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "aprovado") return <Badge className="bg-success text-success-foreground">Ativo</Badge>;
  if (s === "trial") return <Badge className="bg-primary text-primary-foreground">Teste</Badge>;
  if (s === "canceled" || s === "cancelled") return <Badge variant="secondary">Cancelado</Badge>;
  if (s === "expired") return <Badge variant="destructive">Expirado</Badge>;
  if (s === "refunded") return <Badge variant="destructive">Refunded</Badge>;
  if (!s || s === "none") return <Badge variant="outline">Sem assinatura</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function AssinaturasAdminPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"assinantes" | "logs">("assinantes");

  if (!isAdmin) return <Navigate to="/app/importar" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Assinaturas Nexano</h1>
          <p className="text-sm text-muted-foreground">
            Painel administrativo de assinantes, transações e eventos do webhook Nexano.
          </p>
        </div>
      </div>

      <Indicadores />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "assinantes" | "logs")}>
        <TabsList>
          <TabsTrigger value="assinantes">Assinantes</TabsTrigger>
          <TabsTrigger value="logs">Logs Nexano</TabsTrigger>
        </TabsList>
        <TabsContent value="assinantes" className="mt-4">
          <Assinantes />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsNexano />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Indicadores() {
  const [stats, setStats] = useState({
    ativos: 0, cancelados: 0, refunded: 0, novosMes: 0, receitaMensal: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const inicioMes = new Date();
      inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);

      const [a, c, r, novos, ativosSub] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "refunded"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", inicioMes.toISOString()),
        supabase.from("nexano_subscriptions").select("subscription_identifier, subscription_status, interval_type, interval_count").eq("subscription_status", "ACTIVE"),
      ]);

      // Estimar receita mensal: precisa de última transação por assinatura
      let receita = 0;
      if (ativosSub.data && ativosSub.data.length > 0) {
        const idents = ativosSub.data.map((s) => s.subscription_identifier);
        const { data: evts } = await supabase
          .from("billing_events")
          .select("payload, external_id")
          .in("external_id", idents)
          .eq("event_type", "TRANSACTION_PAID")
          .order("created_at", { ascending: false })
          .limit(500);
        const seen = new Set<string>();
        for (const e of evts ?? []) {
          if (!e.external_id || seen.has(e.external_id)) continue;
          seen.add(e.external_id);
          const p = e.payload as any;
          const amount = p?.transaction?.amount;
          if (typeof amount === "number") receita += amount;
        }
      }

      setStats({
        ativos: a.count ?? 0,
        cancelados: c.count ?? 0,
        refunded: r.count ?? 0,
        novosMes: novos.count ?? 0,
        receitaMensal: receita,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "Assinaturas Ativas", value: stats.ativos },
    { label: "Canceladas", value: stats.cancelados },
    { label: "Refunded", value: stats.refunded },
    { label: "Receita estimada/mês", value: fmtMoneyCents(stats.receitaMensal) },
    { label: "Novos clientes no mês", value: stats.novosMes },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "…" : c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Assinantes() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroKey>("todos");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const [detalheUser, setDetalheUser] = useState<ProfileRow | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("profiles")
      .select("id,email,nome,cpf,telefone,plano_nome,subscription_status,subscription_identifier,subscription_provider,subscription_start_date,subscription_end_date,trial_end_date,created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filtro === "ativos") q = q.eq("subscription_status", "active");
    else if (filtro === "cancelados") q = q.eq("subscription_status", "canceled");
    else if (filtro === "refunded") q = q.eq("subscription_status", "refunded");
    else if (filtro === "expirados") q = q.eq("subscription_status", "expired");
    else if (filtro === "trial") q = q.eq("subscription_status", "trial");
    else if (filtro === "sem") q = q.is("subscription_status", null);

    const term = busca.trim();
    if (term) {
      const esc = term.replace(/[%,]/g, "");
      q = q.or(`nome.ilike.%${esc}%,email.ilike.%${esc}%,cpf.ilike.%${esc}%,subscription_identifier.ilike.%${esc}%`);
    }

    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ProfileRow[]);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filtro, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filtro === f.key ? "default" : "outline"}
            onClick={() => { setFiltro(f.key); setPage(0); }}
          >
            {f.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, email, CPF, identifier…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); load(); } }}
              className="pl-8 w-72"
            />
          </div>
          <Button size="sm" onClick={() => { setPage(0); load(); }}>Buscar</Button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.nome ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                    {u.cpf && <div className="font-mono text-xs text-muted-foreground">CPF {u.cpf}</div>}
                  </TableCell>
                  <TableCell>{u.plano_nome ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={u.subscription_status} /></TableCell>
                  <TableCell className="text-xs">{fmtDateShort(u.subscription_start_date)}</TableCell>
                  <TableCell className="text-xs">{fmtDateShort(u.subscription_end_date ?? u.trial_end_date)}</TableCell>
                  <TableCell className="font-mono text-xs">{u.subscription_identifier ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDateShort(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetalheUser(u)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Nenhum assinante encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {total} registro(s) — página {page + 1} de {totalPages}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DetalheCliente user={detalheUser} onClose={() => setDetalheUser(null)} />
    </div>
  );
}

function DetalheCliente({ user, onClose }: { user: ProfileRow | null; onClose: () => void }) {
  const [historico, setHistorico] = useState<NexanoRow[]>([]);
  const [ultTx, setUltTx] = useState<BillingEvent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: hist }, { data: tx }] = await Promise.all([
        supabase.from("nexano_subscriptions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("billing_events").select("*").eq("customer_email", user.email).eq("event_type", "TRANSACTION_PAID").order("created_at", { ascending: false }).limit(1),
      ]);
      setHistorico((hist ?? []) as NexanoRow[]);
      setUltTx((tx?.[0] ?? null) as BillingEvent | null);
      setLoading(false);
    })();
  }, [user]);

  const ultTxPayload = ultTx?.payload as any;

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {user && (
          <>
            <SheetHeader>
              <SheetTitle>{user.nome ?? user.email}</SheetTitle>
              <SheetDescription>{user.email}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Dados cadastrais</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Nome</dt><dd>{user.nome ?? "—"}</dd>
                  <dt className="text-muted-foreground">Email</dt><dd className="font-mono text-xs">{user.email}</dd>
                  <dt className="text-muted-foreground">CPF</dt><dd className="font-mono text-xs">{user.cpf ?? "—"}</dd>
                  <dt className="text-muted-foreground">Telefone</dt><dd className="font-mono text-xs">{user.telefone ?? "—"}</dd>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Assinatura atual</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Plano</dt><dd>{user.plano_nome ?? "—"}</dd>
                  <dt className="text-muted-foreground">Provider</dt><dd>{user.subscription_provider ?? "—"}</dd>
                  <dt className="text-muted-foreground">Identifier</dt><dd className="font-mono text-xs">{user.subscription_identifier ?? "—"}</dd>
                  <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={user.subscription_status} /></dd>
                  <dt className="text-muted-foreground">Início</dt><dd>{fmtDate(user.subscription_start_date)}</dd>
                  <dt className="text-muted-foreground">Vencimento</dt><dd>{fmtDate(user.subscription_end_date ?? user.trial_end_date)}</dd>
                </dl>
              </section>

              {ultTx && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Última transação</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Transaction ID</dt><dd className="font-mono text-xs">{ultTxPayload?.transaction?.id ?? "—"}</dd>
                    <dt className="text-muted-foreground">Identifier</dt><dd className="font-mono text-xs">{ultTxPayload?.transaction?.identifier ?? "—"}</dd>
                    <dt className="text-muted-foreground">Método</dt><dd>{ultTxPayload?.transaction?.paymentMethod ?? "—"}</dd>
                    <dt className="text-muted-foreground">Valor</dt><dd>{fmtMoneyCents(ultTxPayload?.transaction?.amount)}</dd>
                    <dt className="text-muted-foreground">Data</dt><dd>{fmtDate(ultTxPayload?.transaction?.payedAt)}</dd>
                  </dl>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Histórico ({historico.length})</h3>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : historico.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem registros.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Atualizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs">{h.last_event_type ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={h.subscription_status} /></TableCell>
                          <TableCell className="font-mono text-xs">{h.subscription_identifier}</TableCell>
                          <TableCell className="text-xs">{fmtDate(h.updated_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LogsNexano() {
  const [rows, setRows] = useState<BillingEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<BillingEvent | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("billing_events")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const term = busca.trim();
    if (term) {
      const esc = term.replace(/[%,]/g, "");
      q = q.or(`customer_email.ilike.%${esc}%,external_id.ilike.%${esc}%,event_type.ilike.%${esc}%`);
    }

    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      toast.error("Erro: " + error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as BillingEvent[]);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por email, identifier, evento…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); load(); } }}
            className="pl-8 w-80"
          />
        </div>
        <Button size="sm" onClick={() => { setPage(0); load(); }}>Buscar</Button>
      </div>

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{fmtDate(e.created_at)}</TableCell>
                  <TableCell className="text-xs">{e.event_type ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "auth_success" || e.status === "processed" ? "default" : e.status === "error" ? "destructive" : "secondary"}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.customer_email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.external_id ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetalhe(e)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhum evento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">{total} evento(s) — página {page + 1} de {totalPages}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {detalhe && (
            <>
              <SheetHeader>
                <SheetTitle>{detalhe.event_type ?? "Evento"}</SheetTitle>
                <SheetDescription>{fmtDate(detalhe.created_at)} • {detalhe.status}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Provider</dt><dd>{detalhe.provider}</dd>
                  <dt className="text-muted-foreground">Email</dt><dd className="font-mono text-xs">{detalhe.customer_email ?? "—"}</dd>
                  <dt className="text-muted-foreground">Identifier</dt><dd className="font-mono text-xs">{detalhe.external_id ?? "—"}</dd>
                  <dt className="text-muted-foreground">IP origem</dt><dd className="font-mono text-xs">{detalhe.source_ip ?? "—"}</dd>
                  <dt className="text-muted-foreground">Processado em</dt><dd>{fmtDate(detalhe.processed_at)}</dd>
                </dl>
                {detalhe.error_message && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <strong>Erro:</strong> {detalhe.error_message}
                  </div>
                )}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Headers</h4>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(detalhe.headers, null, 2)}</pre>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Payload</h4>
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(detalhe.payload, null, 2)}</pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
