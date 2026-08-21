import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plane, Loader2, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ferias")({
  component: FeriasPage,
});

interface Militar {
  id: string;
  nome: string;
  matricula: string | null;
  posto_graduacao: string | null;
  is_adm: boolean;
}

interface FeriasRow {
  id: string;
  militar_id: string;
  ano: number;
  periodo: number;
  data_inicio: string;
  data_fim: string;
}

function FeriasPage() {
  const { user } = useAuth();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [militares, setMilitares] = useState<Militar[]>([]);
  const [ferias, setFerias] = useState<FeriasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  const carregar = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from("militares").select("id, nome, matricula, posto_graduacao, is_adm").eq("user_id", user.id).eq("ativo", true).order("nome"),
      supabase.from("ferias_militares").select("id, militar_id, ano, periodo, data_inicio, data_fim").eq("user_id", user.id).eq("ano", ano),
    ]);
    setMilitares((m ?? []) as Militar[]);
    setFerias((f ?? []) as FeriasRow[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [user, ano]);

  const porMilitar = useMemo(() => {
    const map = new Map<string, FeriasRow[]>();
    for (const f of ferias) {
      const arr = map.get(f.militar_id) ?? [];
      arr.push(f);
      map.set(f.militar_id, arr);
    }
    return map;
  }, [ferias]);

  const salvarPeriodo = async (militarId: string, periodo: number, dataInicio: string, dataFim: string) => {
    if (!user) return;
    if (!dataInicio || !dataFim) { toast.error("Preencha início e fim."); return; }
    if (dataFim < dataInicio) { toast.error("Data fim deve ser ≥ data início."); return; }
    setSaving(`${militarId}-${periodo}`);
    const existente = porMilitar.get(militarId)?.find((p) => p.periodo === periodo);
    let error;
    if (existente) {
      ({ error } = await supabase.from("ferias_militares").update({
        data_inicio: dataInicio, data_fim: dataFim,
      }).eq("id", existente.id));
    } else {
      ({ error } = await supabase.from("ferias_militares").insert({
        user_id: user.id, militar_id: militarId, ano, periodo,
        data_inicio: dataInicio, data_fim: dataFim,
      }));
    }
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Período ${periodo} salvo.`);
    carregar();
  };

  const removerPeriodo = async (id: string) => {
    const { error } = await supabase.from("ferias_militares").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Período removido.");
    carregar();
  };

  const filtrados = militares.filter((m) =>
    !filtro.trim() ||
    m.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    (m.matricula ?? "").includes(filtro)
  );

  const conteudoPorMilitar = (
    <>
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label>Ano</Label>
          <Input type="number" min={2024} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-28" />
        </div>
        <div className="flex-1 space-y-1 min-w-[220px]">
          <Label>Buscar militar</Label>
          <Input placeholder="Nome ou matrícula" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
      </div>


      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum militar cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map((m) => {
            const periodos = porMilitar.get(m.id) ?? [];
            return (
              <div key={m.id} className="panel p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {m.posto_graduacao ? `${m.posto_graduacao} ` : ""}{m.nome}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{m.matricula || "sem matrícula"}</div>
                  </div>
                  {m.is_adm && <Badge variant="secondary">ADM</Badge>}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[1, 2, 3].map((p) => {
                    const existente = periodos.find((x) => x.periodo === p);
                    return (
                      <PeriodoEditor
                        key={p}
                        periodo={p}
                        ano={ano}
                        existente={existente}
                        saving={saving === `${m.id}-${p}`}
                        onSave={(ini, fim) => salvarPeriodo(m.id, p, ini, fim)}
                        onRemove={() => existente && removerPeriodo(existente.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Plane className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Plano de Férias</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre até 3 períodos por militar. O sistema marca <span className="font-mono">FER</span> automaticamente nos dias correspondentes.
          </p>
        </div>
      </div>

      <Tabs defaultValue="militar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="militar">Pesquisar por militar</TabsTrigger>
          <TabsTrigger value="mes">Consultar por mês/ano</TabsTrigger>
        </TabsList>
        <TabsContent value="militar" className="space-y-6">{conteudoPorMilitar}</TabsContent>
        <TabsContent value="mes">
          <ConsultaMensal userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function PeriodoEditor({
  periodo, ano, existente, saving, onSave, onRemove,
}: {
  periodo: number;
  ano: number;
  existente?: FeriasRow;
  saving: boolean;
  onSave: (ini: string, fim: string) => void;
  onRemove: () => void;
}) {
  const [ini, setIni] = useState(existente?.data_inicio ?? "");
  const [fim, setFim] = useState(existente?.data_fim ?? "");

  useEffect(() => {
    setIni(existente?.data_inicio ?? "");
    setFim(existente?.data_fim ?? "");
  }, [existente?.id, existente?.data_inicio, existente?.data_fim]);

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período {periodo}</div>
        {existente && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 px-2 text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Início</Label>
          <Input type="date" value={ini} min={`${ano}-01-01`} max={`${ano}-12-31`} onChange={(e) => setIni(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Fim</Label>
          <Input type="date" value={fim} min={`${ano}-01-01`} max={`${ano}-12-31`} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={() => onSave(ini, fim)} disabled={saving || !ini || !fim}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 mr-1" /> Salvar</>}
      </Button>
    </div>
  );
}
