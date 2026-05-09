import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gerarEscala } from "@/utils/escala.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, History, Loader2, Download, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/importar")({
  component: ImportarPage,
});

interface HistoricoRow {
  id: string;
  mes: number;
  ano: number;
  arquivo_nome: string | null;
  observacoes_texto: string | null;
  alertas: unknown;
  arquivo_saida_path: string | null;
  status: string;
  created_at: string;
}

const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function detectAnexoB(names: string[]) {
  return names.find((n) => n.trim().toLowerCase().includes("anexo b"));
}

/** Tenta achar mês/ano escrito na aba Anexo B (procura "MES" e "ANO" ou string tipo "Janeiro/2026"). */
function detectMesAnoAnexoB(wb: XLSX.WorkBook, anexoBName: string): { mes?: number; ano?: number } {
  const ws = wb.Sheets[anexoBName];
  if (!ws) return {};
  const mesesNomes = ["janeiro","fevereiro","março","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  if (!range) return {};
  const maxRow = Math.min(range.e.r, 12);
  for (let r = 0; r <= maxRow; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 30); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const v = cell?.v;
      if (typeof v !== "string") continue;
      const lower = v.toLowerCase();
      for (let i = 0; i < mesesNomes.length; i++) {
        if (lower.includes(mesesNomes[i])) {
          const anoMatch = lower.match(/(20\d{2})/);
          const mesIdx = i >= 3 ? i - (mesesNomes[2] === "março" && i > 2 ? 0 : 0) : i;
          // mapear índices: 0=jan,1=fev,2=mar,3=mar(marco alt),4=abr...
          const mapMes = i <= 2 ? i + 1 : i === 3 ? 3 : i; // marco também = 3
          return { mes: mapMes, ano: anoMatch ? Number(anoMatch[1]) : undefined };
        }
      }
    }
  }
  return {};
}

async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

function ImportarPage() {
  const { user, session } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const gerarFn = useServerFn(gerarEscala);

  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [anexoBName, setAnexoBName] = useState<string | null>(null);
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [planilhaMes, setPlanilhaMes] = useState<number | undefined>();
  const [planilhaAno, setPlanilhaAno] = useState<number | undefined>();

  const [openObs, setOpenObs] = useState(false);
  const [openConfirmDivergencia, setOpenConfirmDivergencia] = useState(false);
  const [militaresPorDia, setMilitaresPorDia] = useState(4);
  const [minCovPorDia, setMinCovPorDia] = useState(1);
  const [minCgPorDia, setMinCgPorDia] = useState(1);
  const [modo, setModo] = useState<"auto" | "ordinario_puro">("auto");
  const [observacoesTexto, setObservacoesTexto] = useState("");

  // Virada do mês anterior
  interface MilitarOp { id: string; nome: string; matricula: string | null; is_cg: boolean; is_cov: boolean; }
  const [militaresOp, setMilitaresOp] = useState<MilitarOp[]>([]);
  const [viradaSel, setViradaSel] = useState<Record<string, "ord" | "he">>({});
  const [filtroVirada, setFiltroVirada] = useState("");

  const [busy, setBusy] = useState(false);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const loadHistorico = async () => {
    setLoadingHist(true);
    const { data, error } = await supabase
      .from("escalas_geradas")
      .select("id, mes, ano, arquivo_nome, observacoes_texto, alertas, arquivo_saida_path, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) setHistorico((data ?? []) as HistoricoRow[]);
    setLoadingHist(false);
  };

  useEffect(() => { loadHistorico(); }, []);

  // Carrega militares operacionais (24h, não-ADM) para a seleção da virada
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("militares")
        .select("id, nome, matricula, is_cg, is_cov, is_adm, tipo_escala, ativo")
        .eq("ativo", true);
      const list = (data ?? [])
        .filter((m) => !m.is_adm && (m.tipo_escala ?? "24h") === "24h")
        .map((m) => ({ id: m.id, nome: m.nome, matricula: m.matricula, is_cg: !!m.is_cg, is_cov: !!m.is_cov }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setMilitaresOp(list);
    })();
  }, []);

  const militaresFiltrados = useMemo(() => {
    const f = filtroVirada.trim().toLowerCase();
    if (!f) return militaresOp;
    return militaresOp.filter((m) =>
      m.nome.toLowerCase().includes(f) || (m.matricula ?? "").toLowerCase().includes(f)
    );
  }, [militaresOp, filtroVirada]);

  const toggleVirada = (id: string) => {
    setViradaSel((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = "ord";
      return next;
    });
  };
  const setTipoVirada = (id: string, tipo: "ord" | "he") => {
    setViradaSel((prev) => ({ ...prev, [id]: tipo }));
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setSheetNames([]);
    setAnexoBName(null);
    setPlanilhaMes(undefined);
    setPlanilhaAno(undefined);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setSheetNames(wb.SheetNames);
      const found = detectAnexoB(wb.SheetNames);
      setAnexoBName(found ?? null);
      if (found) {
        toast.success(`Aba "${found}" detectada.`);
        const det = detectMesAnoAnexoB(wb, found);
        setPlanilhaMes(det.mes);
        setPlanilhaAno(det.ano);
      } else {
        toast.error('Arquivo não contém aba "Anexo B".');
      }
    } catch (err) {
      toast.error("Falha ao ler o arquivo.");
      console.error(err);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const divergenciaMesAno =
    (planilhaMes !== undefined && planilhaMes !== mes) ||
    (planilhaAno !== undefined && planilhaAno !== ano);

  const abrirObservacoes = () => {
    if (!file) { toast.error("Selecione a planilha-modelo."); return; }
    if (!anexoBName) { toast.error("Arquivo sem aba Anexo B."); return; }
    if (divergenciaMesAno) { setOpenConfirmDivergencia(true); return; }
    setOpenObs(true);
  };

  const baixar = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("escalas").createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) { toast.error("Não foi possível gerar link."); return; }
    window.open(data.signedUrl, "_blank");
  };

  const gerar = async () => {
    if (!file || !user || !session) return;
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const viradaAnterior = Object.entries(viradaSel).map(([militarId, tipo]) => ({ militarId, tipo }));
      const result = await gerarFn({
        data: {
          fileBase64: base64,
          fileName: file.name,
          mes, ano,
          parametros: { militaresPorDia, minCovPorDia, minCgPorDia, observacoesTexto },
          viradaAnterior,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as Parameters<typeof gerarFn>[0]);

      if (!result || typeof result !== "object" || !("escritas" in result)) {
        throw new Error("Resposta inválida do servidor. Verifique os logs da função.");
      }

      toast.success(`Escala gerada (${result.escritas} células preenchidas).`);
      if (result.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
      if (result.alertas?.length) {
        toast.warning(`${result.alertas.length} alerta(s) — ver no histórico.`);
      }
      setOpenObs(false);
      setFile(null); setSheetNames([]); setAnexoBName(null);
      setObservacoesTexto("");
      setViradaSel({});
      setFiltroVirada("");
      if (fileRef.current) fileRef.current.value = "";
      loadHistorico();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar escala.";
      toast.error(msg);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Importar planilha</h1>
          <p className="text-sm text-muted-foreground">
            Aba <span className="font-mono text-foreground">Anexo B - Escala</span> obrigatória. Os militares são casados com a aba Efetivo por matrícula.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
        {/* Coluna esquerda */}
        <div className="panel space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {meses.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input type="number" min={2024} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Planilha-modelo (.xlsx)</Label>
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-input/40 p-6">
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} className="hidden" />
              {!file ? (
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="self-start">
                  <Upload className="h-4 w-4" /> Selecionar arquivo
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-sm">{file.name}</div>
                    <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Trocar</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Abas:</span>
                    {sheetNames.map((n) => {
                      const isAnexo = n === anexoBName;
                      return (
                        <Badge key={n} variant={isAnexo ? "default" : "secondary"}>{n}</Badge>
                      );
                    })}
                  </div>
                  {anexoBName ? (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Aba "{anexoBName}" detectada.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" /> Aba "Anexo B" não encontrada. Geração impedida.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={abrirObservacoes} disabled={!file || !anexoBName}>
              <Sparkles className="mr-2 h-4 w-4" /> Continuar para observações
            </Button>
          </div>
        </div>

        {/* Histórico */}
        <div className="panel space-y-4 p-6">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Histórico</h2>
          </div>
          {loadingHist ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma escala gerada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {historico.map((h) => {
                const alertas = Array.isArray(h.alertas) ? h.alertas.length : 0;
                return (
                  <li key={h.id} className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{meses[h.mes - 1]} / {h.ano}</div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {h.arquivo_nome && (
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{h.arquivo_nome}</div>
                    )}
                    {h.observacoes_texto && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary">Ver observações</summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{h.observacoes_texto}</pre>
                      </details>
                    )}
                    {alertas > 0 && Array.isArray(h.alertas) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs">
                          <Badge variant="outline" className="border-warning text-warning">
                            {alertas} alerta{alertas > 1 ? "s" : ""}
                          </Badge>
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs">
                          {(h.alertas as { tipo: string; msg: string }[]).map((a, i) => (
                            <li key={i} className={a.tipo === "error" ? "text-destructive" : a.tipo === "warn" ? "text-warning" : "text-muted-foreground"}>
                              • {a.msg}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {h.arquivo_saida_path && (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => baixar(h.arquivo_saida_path)}>
                        <Download className="mr-1 h-3 w-3" /> Baixar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Modal de observações */}
      <Dialog open={openObs} onOpenChange={setOpenObs}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Observações para gerar a escala</DialogTitle>
            <DialogDescription>
              Defina os parâmetros da escala. Em seguida descreva, em texto livre, particularidades como afastamentos,
              reforços de COV/CG em dias específicos ou exceções por militar. A IA vai interpretar e aplicar.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Militares/dia (padrão)</Label>
              <Input type="number" min={1} max={20} value={militaresPorDia} onChange={(e) => setMilitaresPorDia(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Mín. CG/dia</Label>
              <Input type="number" min={0} max={10} value={minCgPorDia} onChange={(e) => setMinCgPorDia(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Mín. COV/dia</Label>
              <Input type="number" min={0} max={10} value={minCovPorDia} onChange={(e) => setMinCovPorDia(Number(e.target.value))} />
            </div>
          </div>

          {/* Virada do mês anterior */}
          <div className="space-y-2 rounded-md border border-border bg-input/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">Virada do mês anterior</Label>
                <p className="text-xs text-muted-foreground">
                  Marque os militares que estavam de serviço no <strong>último dia do mês anterior</strong>. Eles iniciarão o mês com apenas 8h (00h–08h) e ficarão de folga em 01 e 02.
                </p>
              </div>
              {Object.keys(viradaSel).length > 0 && (
                <Badge variant="default">{Object.keys(viradaSel).length} marcado(s)</Badge>
              )}
            </div>
            <Input
              placeholder="Buscar por nome ou matrícula..."
              value={filtroVirada}
              onChange={(e) => setFiltroVirada(e.target.value)}
              className="h-8"
            />
            <div className="max-h-48 overflow-y-auto rounded border border-border bg-background/40">
              {militaresFiltrados.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Nenhum militar operacional cadastrado.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {militaresFiltrados.map((m) => {
                    const sel = viradaSel[m.id];
                    return (
                      <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                        <Checkbox
                          checked={!!sel}
                          onCheckedChange={() => toggleVirada(m.id)}
                          id={`v-${m.id}`}
                        />
                        <label htmlFor={`v-${m.id}`} className="flex-1 cursor-pointer text-sm">
                          {m.nome}
                          {m.matricula && <span className="ml-2 font-mono text-xs text-muted-foreground">{m.matricula}</span>}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {m.is_cg ? "CG " : ""}{m.is_cov ? "COV" : ""}
                          </span>
                        </label>
                        {sel && (
                          <Select value={sel} onValueChange={(v) => setTipoVirada(m.id, v as "ord" | "he")}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ord">ORD (1+CM2)</SelectItem>
                              <SelectItem value="he">HE (HE8)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="obs">Observações livres</Label>
            <Textarea
              id="obs"
              rows={10}
              className="font-mono text-sm"
              value={observacoesTexto}
              onChange={(e) => setObservacoesTexto(e.target.value)}
              placeholder={`Exemplos:
Sgt Fulano férias do dia 11 ao 20.
No dia 25 escalar 5 militares.
Dia 04 reforçar com 1 COV extra.
Sd Ciclano só pode entrar como CG.
Cb Beltrano não escalar dia 15.`}
            />
            <p className="text-xs text-muted-foreground">
              Regras automáticas: 24x72, folga mínima 12h, sigla padrão <span className="font-mono">2341</span>, 1 CG + ≥1 COV por dia.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenObs(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={gerar} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</> : <><Sparkles className="mr-2 h-4 w-4" /> Gerar escala</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openConfirmDivergencia} onOpenChange={setOpenConfirmDivergencia}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mês/Ano divergente</DialogTitle>
            <DialogDescription>
              A planilha enviada parece ser de{" "}
              <strong>
                {planilhaMes ? meses[planilhaMes - 1] : "?"}/{planilhaAno ?? "?"}
              </strong>{" "}
              mas você selecionou <strong>{meses[mes - 1]}/{ano}</strong>. Deseja continuar mesmo assim?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConfirmDivergencia(false)}>Cancelar</Button>
            <Button onClick={() => { setOpenConfirmDivergencia(false); setOpenObs(true); }}>
              Continuar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
