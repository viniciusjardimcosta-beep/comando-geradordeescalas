import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, AlertTriangle, UserCog, FileText, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/nbi/configuracoes")({
  component: NbiConfiguracoesPage,
  head: () => ({
    meta: [
      { title: "Configurações NBI — Comando" },
      { name: "description", content: "Configurações do módulo de Notas para Boletim Interno." },
    ],
  }),
});

interface MilitarLite {
  id: string;
  nome: string;
  posto_graduacao: string | null;
  matricula: string | null;
  quadro: string | null;
  lotacao_nbi: string | null;
  funcao_atual: string | null;
  genero_gramatical: string | null;
}

interface Responsavel {
  militar_id: string | null;
  nome: string;
  posto_quadro: string;
  funcao: string;
  lotacao: string;
}

interface NbiSettingsForm {
  unidade_nome: string;
  unidade_sigla: string;
  digitador: Responsavel;
  comandante: Responsavel;
  autoridade: Responsavel;
}

const emptyResp: Responsavel = {
  militar_id: null,
  nome: "",
  posto_quadro: "",
  funcao: "",
  lotacao: "",
};

const emptySettings: NbiSettingsForm = {
  unidade_nome: "",
  unidade_sigla: "",
  digitador: { ...emptyResp },
  comandante: { ...emptyResp },
  autoridade: { ...emptyResp },
};

function montarPostoQuadro(m: MilitarLite): string {
  const posto = (m.posto_graduacao ?? "").trim();
  const quadro = (m.quadro ?? "").trim();
  if (!posto && !quadro) return "";
  if (!quadro) return posto;
  if (!posto) return quadro;
  // Evita duplicar quadro caso já esteja no posto_graduacao.
  const upP = posto.toUpperCase();
  const upQ = quadro.toUpperCase();
  if (upP.includes(upQ)) return posto;
  return `${posto} ${quadro}`;
}

function isCadastroNbiIncompleto(m: MilitarLite): boolean {
  return !m.quadro?.trim() || !m.lotacao_nbi?.trim() || !(m.genero_gramatical === "M" || m.genero_gramatical === "F");
}

function faltantes(m: MilitarLite): string[] {
  const out: string[] = [];
  if (!m.quadro?.trim()) out.push("Quadro");
  if (!m.lotacao_nbi?.trim()) out.push("Lotação NBI");
  if (!(m.genero_gramatical === "M" || m.genero_gramatical === "F")) out.push("Gênero gramatical");
  return out;
}

function NbiConfiguracoesPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [militares, setMilitares] = useState<MilitarLite[]>([]);
  const [form, setForm] = useState<NbiSettingsForm>(emptySettings);
  const [buscaIncompletos, setBuscaIncompletos] = useState("");
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [militaresRes, settingsRes] = await Promise.all([
        supabase
          .from("militares")
          .select("id, nome, posto_graduacao, matricula, quadro, lotacao_nbi, funcao_atual, genero_gramatical")
          .eq("ativo", true)
          .order("nome"),
        supabase.from("nbi_settings").select("*").maybeSingle(),
      ]);
      if (cancel) return;
      if (militaresRes.error) toast.error("Falha ao carregar militares", { description: militaresRes.error.message });
      else setMilitares((militaresRes.data ?? []) as MilitarLite[]);

      if (settingsRes.error && settingsRes.error.code !== "PGRST116") {
        toast.error("Falha ao carregar configurações", { description: settingsRes.error.message });
      } else if (settingsRes.data) {
        const s = settingsRes.data;
        setSettingsId(s.id);
        setForm({
          unidade_nome: s.unidade_nome ?? "",
          unidade_sigla: s.unidade_sigla ?? "",
          digitador: {
            militar_id: s.digitador_militar_id,
            nome: s.digitador_nome ?? "",
            posto_quadro: s.digitador_posto_quadro ?? "",
            funcao: s.digitador_funcao ?? "",
            lotacao: s.digitador_lotacao ?? "",
          },
          comandante: {
            militar_id: s.comandante_militar_id,
            nome: s.comandante_nome ?? "",
            posto_quadro: s.comandante_posto_quadro ?? "",
            funcao: s.comandante_funcao ?? "",
            lotacao: s.comandante_lotacao ?? "",
          },
          autoridade: {
            militar_id: s.autoridade_militar_id,
            nome: s.autoridade_nome ?? "",
            posto_quadro: s.autoridade_posto_quadro ?? "",
            funcao: s.autoridade_funcao ?? "",
            lotacao: s.autoridade_lotacao ?? "",
          },
        });
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const incompletos = useMemo(
    () => militares.filter(isCadastroNbiIncompleto),
    [militares]
  );
  const incompletosFiltrados = useMemo(() => {
    const q = buscaIncompletos.trim().toLowerCase();
    if (!q) return incompletos;
    return incompletos.filter((m) =>
      m.nome.toLowerCase().includes(q) || (m.matricula ?? "").toLowerCase().includes(q)
    );
  }, [incompletos, buscaIncompletos]);

  function aplicarMilitar(campo: "digitador" | "comandante" | "autoridade", militarId: string) {
    if (militarId === "__manual__") {
      setForm((f) => ({ ...f, [campo]: { ...f[campo], militar_id: null } }));
      return;
    }
    const m = militares.find((x) => x.id === militarId);
    if (!m) return;
    const faltam = faltantes(m);
    if (faltam.length > 0) {
      toast.warning(`Militar com cadastro NBI incompleto: ${faltam.join(", ")}`, {
        description: "Complete os Dados para NBI no cadastro do militar.",
      });
    }
    setForm((f) => ({
      ...f,
      [campo]: {
        militar_id: m.id,
        nome: m.nome,
        posto_quadro: montarPostoQuadro(m),
        funcao: m.funcao_atual ?? "",
        lotacao: m.lotacao_nbi ?? "",
      },
    }));
  }

  async function salvar() {
    if (!session?.user.id) return;
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      unidade_nome: form.unidade_nome.trim() || null,
      unidade_sigla: form.unidade_sigla.trim() || null,
      digitador_militar_id: form.digitador.militar_id,
      digitador_nome: form.digitador.nome.trim() || null,
      digitador_posto_quadro: form.digitador.posto_quadro.trim() || null,
      digitador_funcao: form.digitador.funcao.trim() || null,
      digitador_lotacao: form.digitador.lotacao.trim() || null,
      comandante_militar_id: form.comandante.militar_id,
      comandante_nome: form.comandante.nome.trim() || null,
      comandante_posto_quadro: form.comandante.posto_quadro.trim() || null,
      comandante_funcao: form.comandante.funcao.trim() || null,
      comandante_lotacao: form.comandante.lotacao.trim() || null,
      autoridade_militar_id: form.autoridade.militar_id,
      autoridade_nome: form.autoridade.nome.trim() || null,
      autoridade_posto_quadro: form.autoridade.posto_quadro.trim() || null,
      autoridade_funcao: form.autoridade.funcao.trim() || null,
      autoridade_lotacao: form.autoridade.lotacao.trim() || null,
    } as never;
    let error;
    if (settingsId) {
      ({ error } = await supabase.from("nbi_settings").update(payload).eq("id", settingsId));
    } else {
      const res = await supabase.from("nbi_settings").insert(payload).select("id").single();
      error = res.error;
      if (res.data) setSettingsId(res.data.id);
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else toast.success("Configurações NBI salvas");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações NBI</h1>
        <p className="text-sm text-muted-foreground">
          Responsáveis padrão, dados da unidade e diagnóstico de cadastro dos militares para o
          módulo de Notas para Boletim Interno. Não afeta o Gerador de Escalas.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Dados da unidade (cabeçalho)</CardTitle>
              </div>
              <CardDescription>Aparecem no topo do documento gerado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="uni_nome">Nome da unidade</Label>
                <Input id="uni_nome" value={form.unidade_nome}
                  onChange={(e) => setForm({ ...form, unidade_nome: e.target.value })}
                  placeholder="Ex.: 12º Batalhão de Bombeiro Militar" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="uni_sigla">Sigla</Label>
                <Input id="uni_sigla" value={form.unidade_sigla}
                  onChange={(e) => setForm({ ...form, unidade_sigla: e.target.value })}
                  placeholder="Ex.: 12ºBBM" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Responsáveis padrão das NBIs</CardTitle>
              </div>
              <CardDescription>
                Selecionar um militar preenche automaticamente com os Dados para NBI dele. A edição
                temporária em uma NBI futura não altera estes padrões.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ResponsavelSection titulo="Digitador padrão" campo="digitador"
                militares={militares} valor={form.digitador}
                onAplicar={(id) => aplicarMilitar("digitador", id)}
                onChange={(r) => setForm({ ...form, digitador: r })} />
              <ResponsavelSection titulo="Comandante padrão" campo="comandante"
                militares={militares} valor={form.comandante}
                onAplicar={(id) => aplicarMilitar("comandante", id)}
                onChange={(r) => setForm({ ...form, comandante: r })} />
              <ResponsavelSection titulo="Autoridade publicadora padrão" campo="autoridade"
                militares={militares} valor={form.autoridade}
                onAplicar={(id) => aplicarMilitar("autoridade", id)}
                onChange={(r) => setForm({ ...form, autoridade: r })}
                permitirManual />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar configurações
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <CardTitle className="text-base">Militares com dados NBI incompletos</CardTitle>
                </div>
                <Badge variant={incompletos.length === 0 ? "secondary" : "outline"} className="text-xs">
                  {incompletos.length} de {militares.length}
                </Badge>
              </div>
              <CardDescription>
                Faltando: quadro, lotação NBI ou gênero gramatical. A função administrativa é opcional.
                Complete somente quando for gerar uma NBI para esse militar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Buscar por nome ou matrícula"
                value={buscaIncompletos}
                onChange={(e) => setBuscaIncompletos(e.target.value)}
              />
              {incompletosFiltrados.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {incompletos.length === 0
                    ? "Todos os militares ativos possuem os dados NBI mínimos cadastrados."
                    : "Nenhum militar corresponde ao filtro."}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-md border">
                  {incompletosFiltrados.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-sm font-medium">{m.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[m.posto_graduacao, m.matricula].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {faltantes(m).map((f) => (
                          <span key={f} className="rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-mono uppercase text-warning">
                            {f}
                          </span>
                        ))}
                      </div>
                      <Link to="/app/militares">
                        <Button size="sm" variant="outline">Editar cadastro</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Textos oficiais dos assuntos</CardTitle>
              </div>
              <CardDescription>
                Os textos oficiais dos cinco modelos disponíveis (Férias, Apresentação após férias,
                Viagem, Assunção e Dispensa de função) são versionados e somente leitura nesta
                etapa. A edição dos textos será liberada em uma fase posterior.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}

interface ResponsavelSectionProps {
  titulo: string;
  campo: "digitador" | "comandante" | "autoridade";
  militares: MilitarLite[];
  valor: Responsavel;
  onAplicar: (id: string) => void;
  onChange: (r: Responsavel) => void;
  permitirManual?: boolean;
}

function ResponsavelSection({ titulo, campo, militares, valor, onAplicar, onChange, permitirManual }: ResponsavelSectionProps) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{titulo}</p>
        {valor.militar_id === null && permitirManual && (
          <Badge variant="outline" className="text-[10px]">Preenchimento manual</Badge>
        )}
      </div>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${campo}_militar`}>Militar vinculado</Label>
          <Select
            value={valor.militar_id ?? (permitirManual ? "__manual__" : "")}
            onValueChange={onAplicar}
          >
            <SelectTrigger id={`${campo}_militar`}>
              <SelectValue placeholder="Selecione um militar" />
            </SelectTrigger>
            <SelectContent>
              {permitirManual && <SelectItem value="__manual__">— Preencher manualmente —</SelectItem>}
              {militares.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={valor.nome} onChange={(e) => onChange({ ...valor, nome: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Posto + Quadro</Label>
            <Input value={valor.posto_quadro}
              onChange={(e) => onChange({ ...valor, posto_quadro: e.target.value })}
              placeholder="Ex.: 1º SGT QPBM" />
          </div>
          <div className="grid gap-2">
            <Label>Função</Label>
            <Input value={valor.funcao} onChange={(e) => onChange({ ...valor, funcao: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Lotação</Label>
            <Input value={valor.lotacao} onChange={(e) => onChange({ ...valor, lotacao: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}
