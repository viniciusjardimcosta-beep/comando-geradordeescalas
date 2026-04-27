import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, History, Loader2,
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
  diretrizes: string | null;
  alertas: unknown;
  exportacoes: unknown;
  created_at: string;
}

const ANEXO_B_NAME = "ANEXO B";

const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ImportarPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [hasAnexoB, setHasAnexoB] = useState<boolean | null>(null);
  const [diretrizes, setDiretrizes] = useState("");
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const loadHistorico = async () => {
    setLoadingHist(true);
    const { data, error } = await supabase
      .from("escalas_geradas")
      .select("id, mes, ano, arquivo_nome, diretrizes, alertas, exportacoes, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) setHistorico((data ?? []) as HistoricoRow[]);
    setLoadingHist(false);
  };

  useEffect(() => { loadHistorico(); }, []);

  const handleFile = async (f: File) => {
    setFile(f);
    setSheetNames([]);
    setHasAnexoB(null);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setSheetNames(wb.SheetNames);
      const found = wb.SheetNames.some(
        (n) => n.trim().toUpperCase() === ANEXO_B_NAME,
      );
      setHasAnexoB(found);
      if (found) toast.success(`Aba "ANEXO B" detectada.`);
      else toast.error(`Arquivo não contém a aba "ANEXO B".`);
    } catch (err) {
      toast.error("Falha ao ler o arquivo.");
      console.error(err);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const validarEGerar = async () => {
    if (!file) {
      toast.error("Selecione a planilha-modelo.");
      return;
    }
    if (!hasAnexoB) {
      toast.error("Arquivo não possui a aba ANEXO B. Geração impedida.");
      return;
    }
    if (!user) return;

    setBusy(true);
    // Simulação de validação de diretrizes (módulo real virá depois com cadastro de militares).
    const alertas: { tipo: string; mensagem: string }[] = [];
    const linhas = diretrizes
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length > 50) {
      alertas.push({
        tipo: "diretriz",
        mensagem: "Mais de 50 diretrizes informadas — revise antes de gerar.",
      });
    }

    const { error } = await supabase.from("escalas_geradas").insert({
      user_id: user.id,
      mes,
      ano,
      arquivo_nome: file.name,
      diretrizes: diretrizes || null,
      alertas,
      exportacoes: [],
    });
    setBusy(false);
    if (error) {
      toast.error("Erro ao registrar: " + error.message);
      return;
    }
    toast.success("Importação registrada no histórico. (Geração da escala virá na próxima entrega.)");
    setDiretrizes("");
    setFile(null);
    setSheetNames([]);
    setHasAnexoB(null);
    if (fileRef.current) fileRef.current.value = "";
    loadHistorico();
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
            Apenas a aba <span className="font-mono text-foreground">ANEXO B</span> será editável.
            Outras abas, fórmulas, totais e formatação são preservados.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
        {/* Coluna esquerda — formulário */}
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
              <Input
                type="number"
                min={2024}
                max={2100}
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Planilha-modelo (.xlsx)</Label>
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-input/40 p-6">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onPickFile}
                className="hidden"
              />
              {!file ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="self-start"
                >
                  <Upload className="h-4 w-4" /> Selecionar arquivo
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-sm">{file.name}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fileRef.current?.click()}
                    >
                      Trocar
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Abas:</span>
                    {sheetNames.map((n) => {
                      const isAnexo = n.trim().toUpperCase() === ANEXO_B_NAME;
                      return (
                        <Badge key={n} variant={isAnexo ? "default" : "secondary"}>
                          {n}
                        </Badge>
                      );
                    })}
                  </div>
                  {hasAnexoB === true && (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Aba "ANEXO B" detectada. Apenas células editáveis dentro dela serão preenchidas.
                    </div>
                  )}
                  {hasAnexoB === false && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Arquivo não possui a aba "ANEXO B". Geração impedida.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="diretrizes">Diretrizes específicas da escala</Label>
            <Textarea
              id="diretrizes"
              placeholder={`Uma diretriz por linha. Exemplos:
Dia 25 escalar 5 militares.
Dia 04 lançar 2 horas para todos os militares como HE2.
No dia 10, reforçar a guarnição com 1 COV extra.
No dia 15, não escalar o militar Soldado X.
No período de 05 a 10, manter efetivo mínimo de 5 militares.`}
              value={diretrizes}
              onChange={(e) => setDiretrizes(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              As diretrizes respeitam afastamentos, descanso mínimo, CG e COV. Somente o ANEXO B é alterado.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={validarEGerar} disabled={busy || !file || !hasAnexoB}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Validar e registrar importação
            </Button>
          </div>
        </div>

        {/* Coluna direita — histórico */}
        <div className="panel space-y-4 p-6">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Histórico de diretrizes</h2>
          </div>
          {loadingHist ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma escala gerada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {historico.map((h) => {
                const alertas = Array.isArray(h.alertas) ? h.alertas.length : 0;
                return (
                  <li key={h.id} className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">
                        {meses[h.mes - 1]} / {h.ano}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {h.arquivo_nome && (
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {h.arquivo_nome}
                      </div>
                    )}
                    {h.diretrizes && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary">
                          Ver diretrizes ({h.diretrizes.split("\n").filter(Boolean).length})
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                          {h.diretrizes}
                        </pre>
                      </details>
                    )}
                    {alertas > 0 && (
                      <Badge variant="outline" className="mt-2 border-warning text-warning">
                        {alertas} alerta{alertas > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
