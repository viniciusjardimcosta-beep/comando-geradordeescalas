import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, UserSquare2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/militares")({
  component: MilitaresPage,
});

type TipoEscala = "24h" | "parcial";
type Genero = "" | "M" | "F";

interface Militar {
  id: string;
  nome: string;
  posto_graduacao: string | null;
  matricula: string | null;
  is_cov: boolean;
  is_cg: boolean;
  is_adm: boolean;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  tipo_escala: TipoEscala;
  quadro: string | null;
  lotacao_nbi: string | null;
  funcao_atual: string | null;
  distribuicao_interna_nbi: string | null;
  gbm_nbi: string | null;
  companhia_nbi: string | null;
  pelotao_nbi: string | null;
  secao_nbi: string | null;
  subsecao_nbi: string | null;
  setor_nbi: string | null;
  cidade_nbi: string | null;
  batalhao_nbi: string | null;
  funcao_administrativa_nbi: string | null;
  funcao_documental_nbi: string | null;
  genero_gramatical: string | null;
  nome_guerra: string | null;
}

interface FormState {
  nome: string;
  posto_graduacao: string;
  matricula: string;
  is_cov: boolean;
  is_cg: boolean;
  is_adm: boolean;
  ativo: boolean;
  observacoes: string;
  tipo_escala: TipoEscala;
  quadro: string;
  lotacao_nbi: string;
  funcao_atual: string;
  distribuicao_interna_nbi: string;
  gbm_nbi: string;
  companhia_nbi: string;
  pelotao_nbi: string;
  secao_nbi: string;
  subsecao_nbi: string;
  setor_nbi: string;
  cidade_nbi: string;
  batalhao_nbi: string;
  funcao_administrativa_nbi: string;
  funcao_documental_nbi: string;
  genero_gramatical: Genero;
  nome_guerra: string;
}

const emptyForm: FormState = {
  nome: "",
  posto_graduacao: "",
  matricula: "",
  is_cov: false,
  is_cg: false,
  is_adm: false,
  ativo: true,
  observacoes: "",
  tipo_escala: "24h",
  quadro: "",
  lotacao_nbi: "",
  funcao_atual: "",
  distribuicao_interna_nbi: "",
  gbm_nbi: "",
  companhia_nbi: "",
  pelotao_nbi: "",
  secao_nbi: "",
  subsecao_nbi: "",
  setor_nbi: "",
  cidade_nbi: "",
  batalhao_nbi: "",
  funcao_administrativa_nbi: "",
  funcao_documental_nbi: "",
  genero_gramatical: "",
  nome_guerra: "",
};

const QUADROS_SUGERIDOS = ["QPBM", "QTBM", "QOEM", "QOBM", "PME"];


type Filter = "todos" | "cov" | "cg" | "adm" | "bm";

function funcoesBadges(m: Militar) {
  const tags: { label: string; cls: string }[] = [];
  if (m.is_cg) tags.push({ label: "CG", cls: "bg-primary/20 text-primary border-primary/30" });
  if (m.is_cov) tags.push({ label: "COV", cls: "bg-accent/30 text-accent-foreground border-accent/50" });
  if (m.is_adm) tags.push({ label: "ADM", cls: "bg-warning/20 text-warning border-warning/40" });
  if (tags.length === 0) tags.push({ label: "BM", cls: "bg-muted text-muted-foreground border-border" });
  return tags;
}

function MilitaresPage() {
  const { session } = useAuth();
  const [militares, setMilitares] = useState<Militar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Militar | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("militares")
      .select("*")
      .order("nome", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar militares", { description: error.message });
    } else {
      setMilitares((data ?? []) as unknown as Militar[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(m: Militar) {
    setEditing(m);
    setForm({
      nome: m.nome,
      posto_graduacao: m.posto_graduacao ?? "",
      matricula: m.matricula ?? "",
      is_cov: m.is_cov,
      is_cg: m.is_cg,
      is_adm: m.is_adm,
      ativo: m.ativo,
      observacoes: m.observacoes ?? "",
      tipo_escala: m.tipo_escala ?? "24h",
      quadro: m.quadro ?? "",
      lotacao_nbi: m.lotacao_nbi ?? "",
      funcao_atual: m.funcao_atual ?? "",
      distribuicao_interna_nbi: m.distribuicao_interna_nbi ?? "",
      gbm_nbi: m.gbm_nbi ?? "",
      companhia_nbi: m.companhia_nbi ?? "",
      pelotao_nbi: m.pelotao_nbi ?? "",
      secao_nbi: m.secao_nbi ?? "",
      subsecao_nbi: m.subsecao_nbi ?? "",
      setor_nbi: m.setor_nbi ?? "",
      cidade_nbi: m.cidade_nbi ?? "",
      batalhao_nbi: m.batalhao_nbi ?? "",
      funcao_administrativa_nbi: m.funcao_administrativa_nbi ?? "",
      funcao_documental_nbi: m.funcao_documental_nbi ?? "",
      genero_gramatical: (m.genero_gramatical === "M" || m.genero_gramatical === "F") ? m.genero_gramatical : "",
      nome_guerra: m.nome_guerra ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do militar");
      return;
    }
    if (!session?.user.id) return;
    setSaving(true);
    // Mantém 'funcao' (NOT NULL antigo, agora nullable) preenchido por compatibilidade
    const funcaoCompat = form.is_cg ? "CG" : form.is_cov ? "COV" : null;
    const payload = {
      nome: form.nome.trim(),
      posto_graduacao: form.posto_graduacao.trim() || null,
      matricula: form.matricula.trim() || null,
      is_cov: form.is_cov,
      is_cg: form.is_cg,
      is_adm: form.is_adm,
      funcao: funcaoCompat,
      ativo: form.ativo,
      observacoes: form.observacoes.trim() || null,
      tipo_escala: form.tipo_escala,
      quadro: form.quadro.trim() || null,
      lotacao_nbi: form.lotacao_nbi.trim() || null,
      funcao_atual: form.funcao_atual.trim() || null,
      distribuicao_interna_nbi: form.distribuicao_interna_nbi.trim() || null,
      gbm_nbi: form.gbm_nbi.trim() || null,
      companhia_nbi: form.companhia_nbi.trim() || null,
      pelotao_nbi: form.pelotao_nbi.trim() || null,
      secao_nbi: form.secao_nbi.trim() || null,
      subsecao_nbi: form.subsecao_nbi.trim() || null,
      setor_nbi: form.setor_nbi.trim() || null,
      cidade_nbi: form.cidade_nbi.trim() || null,
      batalhao_nbi: form.batalhao_nbi.trim() || null,
      funcao_administrativa_nbi: form.funcao_administrativa_nbi.trim() || null,
      funcao_documental_nbi: form.funcao_documental_nbi.trim() || null,
      genero_gramatical: form.genero_gramatical || null,
      nome_guerra: form.nome_guerra.trim() || null,
    } as never;
    let error;
    if (editing) {
      ({ error } = await supabase.from("militares").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase
        .from("militares")
        .insert({ ...(payload as object), user_id: session.user.id } as never));
    }
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editing ? "Militar atualizado" : "Militar cadastrado");
    setDialogOpen(false);
    load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("militares").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Militar excluído"); load(); }
    setDeleteId(null);
  }

  const filtered = militares.filter((m) => {
    if (filter === "todos") return true;
    if (filter === "cov") return m.is_cov;
    if (filter === "cg") return m.is_cg;
    if (filter === "adm") return m.is_adm;
    if (filter === "bm") return !m.is_cov && !m.is_cg && !m.is_adm;
    return true;
  });
  const totalCov = militares.filter((m) => m.is_cov).length;
  const totalCg = militares.filter((m) => m.is_cg).length;
  const totalAdm = militares.filter((m) => m.is_adm).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Militares do quartel</h1>
          <p className="text-sm text-muted-foreground">
            Marque as funções do militar. COV (motorista) e CG (comandante de guarnição) podem ser
            marcados juntos. ADM = militar de expediente — não entra na escala operacional.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo militar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2">
          <CardDescription>Total</CardDescription>
          <CardTitle className="text-3xl">{militares.length}</CardTitle>
        </CardHeader></Card>
        <Card><CardHeader className="pb-2">
          <CardDescription>CG</CardDescription>
          <CardTitle className="text-3xl">{totalCg}</CardTitle>
        </CardHeader></Card>
        <Card><CardHeader className="pb-2">
          <CardDescription>COV</CardDescription>
          <CardTitle className="text-3xl">{totalCov}</CardTitle>
        </CardHeader></Card>
        <Card><CardHeader className="pb-2">
          <CardDescription>ADM</CardDescription>
          <CardTitle className="text-3xl">{totalAdm}</CardTitle>
        </CardHeader></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["todos", "cg", "cov", "adm", "bm"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "todos" ? "Todos" : f === "bm" ? "Só BM" : f.toUpperCase()}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <UserSquare2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum militar.</p>
              <Button variant="outline" size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" /> Cadastrar o primeiro
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/30">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{m.nome}</p>
                      {!m.ativo && <Badge variant="outline" className="text-[10px]">INATIVO</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[m.posto_graduacao, m.matricula].filter(Boolean).join(" • ") || "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {funcoesBadges(m).map((t) => (
                      <span
                        key={t.label}
                        className={`px-2 py-0.5 rounded border text-[11px] font-mono font-semibold ${t.cls}`}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* RF-01 — modal com altura máxima da viewport, cabeçalho e rodapé fixos
            e apenas a área central rolável. O usuário nunca perde os botões. */}
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4 text-left">
            <DialogTitle>{editing ? "Editar militar" : "Novo militar"}</DialogTitle>
            <DialogDescription>
              Marque as funções aplicáveis. Se não marcar nenhuma, o militar é um BM comum (entra na
              escala operacional sem restrição de função).
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="posto">Posto / Graduação</Label>
                  <Input id="posto" value={form.posto_graduacao}
                    onChange={(e) => setForm({ ...form, posto_graduacao: e.target.value })}
                    placeholder="Ex: SGT, CB, SD" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mat">Matrícula</Label>
                  <Input id="mat" value={form.matricula}
                    onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
                </div>
              </div>

              {/* RF-02 — seções recolhíveis por grupo lógico */}
              <Accordion type="multiple" defaultValue={["operacionais"]} className="w-full">
                <AccordionItem value="operacionais">
                  <AccordionTrigger className="text-sm font-semibold">Dados operacionais</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-1">
                    <div className="grid gap-3 rounded-md border border-border p-3">
                      <Label className="text-sm">Funções</Label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox checked={form.is_cg}
                          onCheckedChange={(v) => setForm({ ...form, is_cg: !!v })} className="mt-1" />
                        <div>
                          <p className="font-medium text-sm">CG — Comandante de Guarnição</p>
                          <p className="text-xs text-muted-foreground">Pode ser escalado como CG no serviço 24h.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox checked={form.is_cov}
                          onCheckedChange={(v) => setForm({ ...form, is_cov: !!v })} className="mt-1" />
                        <div>
                          <p className="font-medium text-sm">COV — Condutor e Operador de Viatura</p>
                          <p className="text-xs text-muted-foreground">Motorista da viatura; pode ser marcado junto com CG.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox checked={form.is_adm}
                          onCheckedChange={(v) => setForm({ ...form, is_adm: !!v })} className="mt-1" />
                        <div>
                          <p className="font-medium text-sm">ADM — Expediente</p>
                          <p className="text-xs text-muted-foreground">Não entra na escala operacional; apenas EXP.</p>
                        </div>
                      </label>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border p-3">
                      <Label htmlFor="tipo_escala">Tipo de escala</Label>
                      <Select
                        value={form.tipo_escala}
                        onValueChange={(v) => setForm({ ...form, tipo_escala: v as TipoEscala })}
                      >
                        <SelectTrigger id="tipo_escala"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24h — serviço operacional 08h–08h</SelectItem>
                          <SelectItem value="parcial">Parcial — apenas turnos curtos (2/23/3) em dias úteis</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        "Parcial" é típico de oficiais administrativos que não entram no serviço 24h
                        (recebem apenas turnos parciais durante o expediente).
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-border p-3">
                      <div>
                        <Label htmlFor="ativo" className="cursor-pointer">Ativo</Label>
                        <p className="text-xs text-muted-foreground">Apenas ativos entram na escala.</p>
                      </div>
                      <Switch id="ativo" checked={form.ativo}
                        onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="nbi">
                  <AccordionTrigger className="text-sm font-semibold">
                    Dados para NBI
                    <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                      opcional · não afeta escala
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Utilizados apenas na geração de Notas para Boletim Interno. Não interferem no motor
                      de escalas nem nas funções operacionais (CG/COV/ADM).
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="quadro">Quadro</Label>
                        <Input
                          id="quadro"
                          list="quadros-sugeridos"
                          value={form.quadro}
                          onChange={(e) => setForm({ ...form, quadro: e.target.value })}
                          placeholder="Ex.: QPBM, QOEM"
                        />
                        <datalist id="quadros-sugeridos">
                          {QUADROS_SUGERIDOS.map((q) => <option key={q} value={q} />)}
                        </datalist>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="genero">Gênero gramatical</Label>
                        <Select
                          value={form.genero_gramatical || "__none__"}
                          onValueChange={(v) => setForm({ ...form, genero_gramatical: (v === "__none__" ? "" : v) as Genero })}
                        >
                          <SelectTrigger id="genero"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Não informado —</SelectItem>
                            <SelectItem value="M">Masculino (o / ao)</SelectItem>
                            <SelectItem value="F">Feminino (a / à)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lotacao_nbi">Lotação para NBI</Label>
                      <Input
                        id="lotacao_nbi"
                        value={form.lotacao_nbi}
                        onChange={(e) => setForm({ ...form, lotacao_nbi: e.target.value })}
                        placeholder="Ex.: 6ºPelBM/8ªCiaBM/15ºBBM"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="funcao_atual">Função administrativa atual</Label>
                      <Input
                        id="funcao_atual"
                        value={form.funcao_atual}
                        onChange={(e) => setForm({ ...form, funcao_atual: e.target.value })}
                        placeholder="Ex.: Sgte do 6ºPelBM/8ªCiaBM/15ºBBM"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Cargo/função administrativa — diferente do papel operacional CG/COV.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="distribuicao_interna_nbi">Distribuição interna (NBI)</Label>
                      <Input
                        id="distribuicao_interna_nbi"
                        value={form.distribuicao_interna_nbi}
                        onChange={(e) => setForm({ ...form, distribuicao_interna_nbi: e.target.value })}
                        placeholder="Ex.: 2ºGBM/6ºPelBM/8ªCiaBM/15ºBBM"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Usada apenas para compor a função em NBIs de Assunção/Dispensa. Não altera o Gerador de Escalas.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="funcao_administrativa_nbi">Função administrativa (NBI)</Label>
                      <Input
                        id="funcao_administrativa_nbi"
                        value={form.funcao_administrativa_nbi}
                        onChange={(e) => setForm({ ...form, funcao_administrativa_nbi: e.target.value })}
                        placeholder="Ex.: Sargenteante"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="funcao_documental_nbi">Função documental (NBI)</Label>
                      <Input
                        id="funcao_documental_nbi"
                        value={form.funcao_documental_nbi}
                        onChange={(e) => setForm({ ...form, funcao_documental_nbi: e.target.value })}
                        placeholder="Ex.: 2º SGT DO SETOR DE VISTORIAS / SSeg / 15ºBBM"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Texto oficial usado em Assunção, Dispensa, Cargo Vago e Comissão. Quando
                        preenchido, o sistema nunca monta a função automaticamente.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="nome_guerra">Nome de guerra</Label>
                      <Input
                        id="nome_guerra"
                        value={form.nome_guerra}
                        onChange={(e) => setForm({ ...form, nome_guerra: e.target.value })}
                        placeholder="Uso interno · o Word sempre usa o nome completo"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="topologia">
                  <AccordionTrigger className="text-sm font-semibold">Topologia institucional (NBI)</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-1">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {([
                        ["gbm_nbi", "GBM", "Ex.: 2 ou 2ºGBM"],
                        ["pelotao_nbi", "Pelotão", "Ex.: 6 ou 6ºPelBM"],
                        ["companhia_nbi", "Companhia", "Ex.: 8 ou 8ªCiaBM"],
                        ["batalhao_nbi", "Batalhão", "Ex.: 15 ou 15ºBBM"],
                        ["secao_nbi", "Seção", "Ex.: 2ª Seção"],
                        ["subsecao_nbi", "Subseção", "Ex.: SSeg"],
                        ["setor_nbi", "Setor", "Ex.: Setor de Vistorias"],
                        ["cidade_nbi", "Cidade", "Ex.: CAMPINAS"],
                      ] as const).map(([campo, label, ph]) => (
                        <div key={campo} className="grid gap-2">
                          <Label htmlFor={campo}>{label}</Label>
                          <Input
                            id={campo}
                            value={form[campo]}
                            onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                            placeholder={ph}
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="observacoes">
                  <AccordionTrigger className="text-sm font-semibold">Observações</AccordionTrigger>
                  <AccordionContent className="pt-1">
                    <Textarea id="obs" value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir militar?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
