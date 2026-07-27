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
import { Loader2, Save, AlertTriangle, UserCog, FileText, Building2, CheckCircle2, SpellCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CampoLivreCorrigido } from "@/components/nbi/CampoLivreCorrigido";
import { sugerirInstitucional } from "@/utils/nbi-institucional";
import { sugerirToponimo } from "@/utils/nbi-toponimos";
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
  cabecalho_estado: string;
  cabecalho_secretaria: string;
  cabecalho_corporacao: string;
  cabecalho_batalhao: string;
  cabecalho_subunidade: string;
  cabecalho_cidade: string;
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
  cabecalho_estado: "",
  cabecalho_secretaria: "",
  cabecalho_corporacao: "",
  cabecalho_batalhao: "",
  cabecalho_subunidade: "",
  cabecalho_cidade: "",
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
          cabecalho_estado: (s as { cabecalho_estado?: string | null }).cabecalho_estado ?? "",
          cabecalho_secretaria: (s as { cabecalho_secretaria?: string | null }).cabecalho_secretaria ?? "",
          cabecalho_corporacao: (s as { cabecalho_corporacao?: string | null }).cabecalho_corporacao ?? "",
          cabecalho_batalhao: (s as { cabecalho_batalhao?: string | null }).cabecalho_batalhao ?? "",
          cabecalho_subunidade: (s as { cabecalho_subunidade?: string | null }).cabecalho_subunidade ?? "",
          cabecalho_cidade: (s as { cabecalho_cidade?: string | null }).cabecalho_cidade ?? "",
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
      cabecalho_estado: form.cabecalho_estado.trim() || null,
      cabecalho_secretaria: form.cabecalho_secretaria.trim() || null,
      cabecalho_corporacao: form.cabecalho_corporacao.trim() || null,
      cabecalho_batalhao: form.cabecalho_batalhao.trim() || null,
      cabecalho_subunidade: form.cabecalho_subunidade.trim() || null,
      cabecalho_cidade: form.cabecalho_cidade.trim() || null,
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
              <CardDescription>
                Aparecem no topo do documento gerado. As 4 primeiras linhas do cabeçalho oficial e
                a subunidade emissora são configuráveis por unidade — nenhum texto é fixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cab_estado">Linha 1 — Estado (cabeçalho oficial)</Label>
                <CampoLivreCorrigido id="cab_estado" value={form.cabecalho_estado}
                  onChange={(v) => setForm({ ...form, cabecalho_estado: v })}
                  modoInstitucional="caixa_alta"
                  placeholder="Ex.: ESTADO DO RIO GRANDE DO SUL" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cab_secretaria">Linha 2 — Secretaria</Label>
                <CampoLivreCorrigido id="cab_secretaria" value={form.cabecalho_secretaria}
                  onChange={(v) => setForm({ ...form, cabecalho_secretaria: v })}
                  modoInstitucional="caixa_alta"
                  placeholder="Ex.: SECRETARIA DA SEGURANÇA PÚBLICA" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cab_corp">Linha 3 — Corporação</Label>
                <CampoLivreCorrigido id="cab_corp" value={form.cabecalho_corporacao}
                  onChange={(v) => setForm({ ...form, cabecalho_corporacao: v })}
                  modoInstitucional="caixa_alta"
                  placeholder="Ex.: CORPO DE BOMBEIROS MILITAR" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cab_bat">Linha 4 — Batalhão</Label>
                <CampoLivreCorrigido id="cab_bat" value={form.cabecalho_batalhao}
                  onChange={(v) => setForm({ ...form, cabecalho_batalhao: v })}
                  modoInstitucional="caixa_alta"
                  placeholder="Ex.: 3º BATALHÃO DE BOMBEIROS MILITAR" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cab_sub">Linha 5 — Subunidade emissora</Label>
                <CampoLivreCorrigido id="cab_sub" value={form.cabecalho_subunidade}
                  onChange={(v) => setForm({ ...form, cabecalho_subunidade: v })}
                  modoInstitucional="caixa_alta"
                  placeholder="Ex.: 2ª COMPANHIA DE BOMBEIROS MILITAR" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cab_cidade">Cidade (local do encerramento)</Label>
                <CampoLivreCorrigido id="cab_cidade" value={form.cabecalho_cidade}
                  onChange={(v) => setForm({ ...form, cabecalho_cidade: v })}
                  modoToponimo
                  placeholder="Ex.: Porto Alegre" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="uni_nome">Nome da unidade (uso interno)</Label>
                <Input id="uni_nome" value={form.unidade_nome}
                  onChange={(e) => setForm({ ...form, unidade_nome: e.target.value })}
                  placeholder="Ex.: 12º Batalhão de Bombeiro Militar" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="uni_sigla">Sigla (uso interno)</Label>
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

          <NumeracaoCard />

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Textos oficiais dos assuntos</CardTitle>
              </div>
              <CardDescription>
                Os textos oficiais dos cinco modelos disponíveis (Férias, Apresentação após férias,
                Viagem, Assunção e Dispensa de função) são versionados e somente leitura nesta
                etapa.
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
            <CampoLivreCorrigido value={valor.funcao}
              onChange={(v) => onChange({ ...valor, funcao: v })}
              modoInstitucional="funcao"
              placeholder="Ex.: Cmt do 15ºBBM" />
          </div>
          <div className="grid gap-2">
            <Label>Lotação</Label>
            <CampoLivreCorrigido value={valor.lotacao}
              onChange={(v) => onChange({ ...valor, lotacao: v })}
              modoInstitucional="lotacao"
              placeholder="Ex.: 1ª CiaBM" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NumeracaoCard() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [anoVigente, setAnoVigente] = useState<number>(new Date().getFullYear());
  const [ultimaNota, setUltimaNota] = useState<number>(0);
  const [reiniciarAnualmente, setReiniciarAnualmente] = useState(true);
  const [prefixo, setPrefixo] = useState<string>("");
  const [maiorEmitido, setMaiorEmitido] = useState<number>(0);
  const [inputUltima, setInputUltima] = useState<string>("0");
  const [logs, setLogs] = useState<Array<{ id: string; acao: string; created_at: string; detalhe: string | null }>>([]);

  useEffect(() => {
    if (!session?.user.id) return;
    void (async () => {
      setLoading(true);
      const uid = session.user.id;
      const [num, docs, log] = await Promise.all([
        supabase.from("nbi_numeracao").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("nbi_documents").select("numero_int").eq("user_id", uid).eq("numero_ano_local", new Date().getFullYear()),
        supabase.from("nbi_numeracao_log").select("id,acao,antes,depois,detalhe,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
      ]);
      if (num.data) {
        setAnoVigente(num.data.ano_vigente);
        setUltimaNota(num.data.ultima_nota);
        setInputUltima(String(num.data.ultima_nota));
        setReiniciarAnualmente(num.data.reiniciar_anualmente);
        setPrefixo(num.data.prefixo ?? "");
      }
      if (docs.data) {
        const max = docs.data.reduce((m, d) => Math.max(m, d.numero_int ?? 0), 0);
        setMaiorEmitido(max);
      }
      if (log.data) {
        setLogs(log.data.map((l) => ({
          id: l.id,
          acao: l.acao,
          created_at: l.created_at,
          detalhe: `${JSON.stringify(l.antes ?? {})} → ${JSON.stringify(l.depois ?? {})}${l.detalhe ? " · " + l.detalhe : ""}`,
        })));
      }
      setLoading(false);
    })();
  }, [session?.user.id]);

  async function salvar() {
    if (!session?.user.id) return;
    const nova = parseInt(inputUltima, 10);
    if (Number.isNaN(nova) || nova < 0) {
      toast.error("Número inválido");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      ano_vigente: anoVigente,
      ultima_nota: nova,
      reiniciar_anualmente: reiniciarAnualmente,
      prefixo: prefixo.trim() || null,
    };
    const { error } = await supabase.from("nbi_numeracao").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar numeração", { description: error.message });
    else {
      toast.success("Numeração atualizada");
      setUltimaNota(nova);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Numeração das NBIs</CardTitle>
        </div>
        <CardDescription>
          Controla a numeração automática. O próximo número previsto só é reservado
          quando você gera efetivamente uma NBI. Não é possível definir um número
          menor que o maior já emitido ({maiorEmitido}) no ano {anoVigente}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Ano vigente</Label>
                <Input type="number" value={anoVigente} onChange={(e) => setAnoVigente(parseInt(e.target.value, 10) || anoVigente)} />
              </div>
              <div className="grid gap-2">
                <Label>Última nota emitida</Label>
                <Input type="number" value={inputUltima} onChange={(e) => setInputUltima(e.target.value)} />
                <p className="text-xs text-muted-foreground">Próximo número previsto: <strong>{(parseInt(inputUltima, 10) || 0) + 1}</strong></p>
              </div>
              <div className="grid gap-2">
                <Label>Prefixo (opcional)</Label>
                <Input value={prefixo} onChange={(e) => setPrefixo(e.target.value)} placeholder="Ex.: NBI" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reiniciarAnualmente} onChange={(e) => setReiniciarAnualmente(e.target.checked)} />
              Reiniciar numeração no início de cada ano
            </label>
            {reiniciarAnualmente && (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                Ao virar o ano, será exigida confirmação visual antes de emitir a primeira NBI do novo ano.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={salvar} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar numeração
              </Button>
            </div>
            {logs.length > 0 && (
              <div className="mt-4 rounded-md border">
                <div className="border-b p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de alterações (últimas 30)</div>
                <div className="max-h-64 divide-y overflow-y-auto text-xs">
                  {logs.map((l) => (
                    <div key={l.id} className="p-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{l.acao}</span>
                        <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{l.detalhe}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

