import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ListOrdered, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/escalas")({
  component: EscalasOrdinariasPage,
});

const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

interface Militar {
  id: string;
  nome: string;
  matricula: string | null;
  posto_graduacao: string | null;
  is_cov: boolean;
  is_cg: boolean;
  is_adm: boolean;
}
interface Escala {
  id: string;
  nome: string;
  ordem: number;
}

function EscalasOrdinariasPage() {
  const { user } = useAuth();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [militares, setMilitares] = useState<Militar[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [membros, setMembros] = useState<Record<string, string[]>>({}); // escalaId -> militarIds
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: m }, { data: e }] = await Promise.all([
      supabase.from("militares").select("id, nome, matricula, posto_graduacao, is_cov, is_cg, is_adm").eq("user_id", user.id).eq("ativo", true).order("nome"),
      supabase.from("escalas_ordinarias").select("id, nome, ordem").eq("user_id", user.id).eq("mes", mes).eq("ano", ano).order("ordem"),
    ]);
    setMilitares((m ?? []) as Militar[]);
    const escs = (e ?? []) as Escala[];
    setEscalas(escs);
    if (escs.length) {
      const { data: mem } = await supabase
        .from("escala_ordinaria_membros")
        .select("escala_id, militar_id")
        .eq("user_id", user.id)
        .in("escala_id", escs.map(x => x.id));
      const map: Record<string, string[]> = {};
      for (const x of mem ?? []) {
        const k = x.escala_id as string;
        map[k] = map[k] ?? [];
        map[k].push(x.militar_id as string);
      }
      setMembros(map);
    } else {
      setMembros({});
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [user, mes, ano]);

  const adicionarEscala = async () => {
    if (!user) return;
    const ordem = (escalas[escalas.length - 1]?.ordem ?? 0) + 1;
    const { error } = await supabase.from("escalas_ordinarias").insert({
      user_id: user.id, mes, ano, ordem, nome: `Escala ${ordem}`,
    });
    if (error) { toast.error(error.message); return; }
    carregar();
  };

  const removerEscala = async (id: string) => {
    if (!confirm("Remover esta escala?")) return;
    await supabase.from("escala_ordinaria_membros").delete().eq("escala_id", id);
    const { error } = await supabase.from("escalas_ordinarias").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    carregar();
  };

  const toggleMembro = async (escalaId: string, militarId: string, marcado: boolean) => {
    if (!user) return;
    if (marcado) {
      // remove de qualquer outra escala do mesmo mês primeiro (militar só em uma escala)
      const outras = Object.entries(membros).filter(([eid, ids]) => eid !== escalaId && ids.includes(militarId));
      for (const [eid] of outras) {
        await supabase.from("escala_ordinaria_membros").delete().eq("escala_id", eid).eq("militar_id", militarId);
      }
      const { error } = await supabase.from("escala_ordinaria_membros").insert({
        user_id: user.id, escala_id: escalaId, militar_id: militarId,
      });
      if (error) { toast.error(error.message); return; }
    } else {
      await supabase.from("escala_ordinaria_membros").delete().eq("escala_id", escalaId).eq("militar_id", militarId);
    }
    carregar();
  };

  const operacionais = useMemo(() => militares.filter(m => !m.is_adm), [militares]);
  const semGrupo = useMemo(() => {
    const todos = new Set(Object.values(membros).flat());
    return operacionais.filter(m => !todos.has(m.id));
  }, [operacionais, membros]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <ListOrdered className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Escalas Ordinárias</h1>
          <p className="text-sm text-muted-foreground">
            Defina os grupos pré-formados (Escala 1, 2, 3, 4…) que entrarão no ciclo 24x72. ADMs não aparecem aqui.
          </p>
        </div>
      </div>

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Ano</Label>
          <Input type="number" min={2024} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-28" />
        </div>
        <Button onClick={adicionarEscala} className="ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Adicionar escala
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : escalas.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          Nenhuma escala ordinária definida para {meses[mes - 1]}/{ano}. Clique em "Adicionar escala" para começar.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {escalas.map((e) => {
            const ids = membros[e.id] ?? [];
            const tomadosPorOutras = new Set(
              Object.entries(membros)
                .filter(([eid]) => eid !== e.id)
                .flatMap(([, mids]) => mids)
            );
            const visiveis = operacionais.filter((m) => !tomadosPorOutras.has(m.id));
            return (
              <div key={e.id} className="panel p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge>Ordem {e.ordem}</Badge>
                    <span className="font-semibold">{e.nome}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removerEscala(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1 rounded border border-border p-2">
                  {visiveis.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">Nenhum militar disponível — todos já estão em outras escalas.</p>
                  ) : visiveis.map((m) => {
                    const checked = ids.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 rounded p-1 hover:bg-muted cursor-pointer text-sm">
                        <Checkbox checked={checked} onCheckedChange={(v) => toggleMembro(e.id, m.id, !!v)} />
                        <span className="flex-1 truncate">
                          {m.posto_graduacao ? `${m.posto_graduacao} ` : ""}{m.nome}
                        </span>
                        <span className="flex gap-1">
                          {m.is_cg && <Badge variant="outline" className="text-[10px] px-1">CG</Badge>}
                          {m.is_cov && <Badge variant="outline" className="text-[10px] px-1">COV</Badge>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ids.length} militar(es) · {ids.filter(id => operacionais.find(m => m.id === id)?.is_cg).length} CG · {ids.filter(id => operacionais.find(m => m.id === id)?.is_cov).length} COV · {Math.max(0, visiveis.length - ids.length)} disponível(is)
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && escalas.length > 0 && semGrupo.length > 0 && (
        <div className="panel p-4">
          <div className="text-sm font-semibold mb-2">Sem grupo ({semGrupo.length})</div>
          <div className="flex flex-wrap gap-1">
            {semGrupo.map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs">{m.nome}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Estes militares operacionais não estão em nenhuma escala ordinária — entrarão por desempate de carga.
          </p>
        </div>
      )}
    </div>
  );
}
