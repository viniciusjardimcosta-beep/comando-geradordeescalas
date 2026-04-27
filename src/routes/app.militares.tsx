import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, UserSquare2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/militares")({
  component: MilitaresPage,
});

type Funcao = "COV" | "CG";

interface Militar {
  id: string;
  nome: string;
  posto_graduacao: string | null;
  matricula: string | null;
  funcao: Funcao;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
}

interface FormState {
  nome: string;
  posto_graduacao: string;
  matricula: string;
  funcao: Funcao;
  ativo: boolean;
  observacoes: string;
}

const emptyForm: FormState = {
  nome: "",
  posto_graduacao: "",
  matricula: "",
  funcao: "COV",
  ativo: true,
  observacoes: "",
};

function MilitaresPage() {
  const { session } = useAuth();
  const [militares, setMilitares] = useState<Militar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | Funcao>("todos");

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
      .order("funcao", { ascending: true })
      .order("nome", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar militares", { description: error.message });
    } else {
      setMilitares((data ?? []) as Militar[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
      funcao: m.funcao,
      ativo: m.ativo,
      observacoes: m.observacoes ?? "",
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
    const payload = {
      nome: form.nome.trim(),
      posto_graduacao: form.posto_graduacao.trim() || null,
      matricula: form.matricula.trim() || null,
      funcao: form.funcao,
      ativo: form.ativo,
      observacoes: form.observacoes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("militares").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase
        .from("militares")
        .insert({ ...payload, user_id: session.user.id }));
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
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
    } else {
      toast.success("Militar excluído");
      load();
    }
    setDeleteId(null);
  }

  const filtered = militares.filter((m) => filter === "todos" || m.funcao === filter);
  const totalCov = militares.filter((m) => m.funcao === "COV").length;
  const totalCg = militares.filter((m) => m.funcao === "CG").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Militares do quartel</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os militares do seu quartel e marque a função: COV (Comandante
            de Viatura) ou CG (Comandante de Guarnição).
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo militar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total cadastrados</CardDescription>
            <CardTitle className="text-3xl">{militares.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>COV</CardDescription>
            <CardTitle className="text-3xl">{totalCov}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CG</CardDescription>
            <CardTitle className="text-3xl">{totalCg}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["todos", "COV", "CG"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "todos" ? "Todos" : f}
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
              <p className="text-sm text-muted-foreground">
                Nenhum militar cadastrado ainda.
              </p>
              <Button variant="outline" size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Cadastrar o primeiro
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{m.nome}</p>
                      {!m.ativo && (
                        <Badge variant="outline" className="text-[10px]">
                          INATIVO
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[m.posto_graduacao, m.matricula].filter(Boolean).join(" • ") ||
                        "—"}
                    </p>
                  </div>
                  <Badge
                    variant={m.funcao === "COV" ? "default" : "secondary"}
                    className="font-mono"
                  >
                    {m.funcao}
                  </Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(m.id)}
                    >
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar militar" : "Novo militar"}
            </DialogTitle>
            <DialogDescription>
              Os dados ficam visíveis apenas para você (e para o ADMIN).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="posto">Posto / Graduação</Label>
                <Input
                  id="posto"
                  value={form.posto_graduacao}
                  onChange={(e) =>
                    setForm({ ...form, posto_graduacao: e.target.value })
                  }
                  placeholder="Ex: SGT, CB, SD"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mat">Matrícula</Label>
                <Input
                  id="mat"
                  value={form.matricula}
                  onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="funcao">Função *</Label>
              <Select
                value={form.funcao}
                onValueChange={(v: Funcao) => setForm({ ...form, funcao: v })}
              >
                <SelectTrigger id="funcao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COV">COV — Comandante de Viatura</SelectItem>
                  <SelectItem value="CG">CG — Comandante de Guarnição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="ativo" className="cursor-pointer">
                  Ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apenas militares ativos entram na escala.
                </p>
              </div>
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Restrições, férias previstas, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir militar?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
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
