// Banco de Férias — aba "Consultar por mês/ano". Componente exclusivo e somente leitura.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MESES_PT,
  formatarDataBR,
  montarResultadoMensal,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  type MilitarResumo,
  type PeriodoFerias,
} from "@/lib/ferias/consultaMensal";

export function ConsultaMensal({ userId }: { userId: string | undefined }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [loading, setLoading] = useState(false);
  const [periodos, setPeriodos] = useState<PeriodoFerias[]>([]);
  const [militares, setMilitares] = useState<MilitarResumo[]>([]);

  useEffect(() => {
    let cancelado = false;
    const consultar = async () => {
      if (!userId) return;
      setLoading(true);
      // Interseção pelas datas reais — o campo `ano` NÃO é usado como critério.
      const [{ data: f, error: ef }, { data: m, error: em }] = await Promise.all([
        supabase
          .from("ferias_militares")
          .select("id, militar_id, ano, periodo, data_inicio, data_fim")
          .eq("user_id", userId)
          .lte("data_inicio", ultimoDiaDoMes(mes, ano))
          .gte("data_fim", primeiroDiaDoMes(mes, ano)),
        supabase
          .from("militares")
          .select("id, nome, matricula, posto_graduacao")
          .eq("user_id", userId),
      ]);
      if (cancelado) return;
      if (ef || em) toast.error((ef ?? em)!.message);
      setPeriodos((f ?? []) as PeriodoFerias[]);
      setMilitares((m ?? []) as MilitarResumo[]);
      setLoading(false);
    };
    consultar();
    return () => { cancelado = true; };
  }, [userId, mes, ano]);

  const resultado = useMemo(
    () => montarResultadoMensal(periodos, militares, mes, ano),
    [periodos, militares, mes, ano],
  );

  const anos = useMemo(() => {
    const base = hoje.getFullYear();
    return Array.from({ length: 9 }, (_, i) => base - 3 + i);
  }, [hoje.getFullYear()]);

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_PT.map((nome, i) => (
                <SelectItem key={nome} value={String(i + 1)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
          <CalendarSearch className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{resultado.titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {resultado.totalMilitares} militares • {resultado.totalPeriodos} períodos encontrados
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : resultado.linhas.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          Nenhum militar com férias neste mês.
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Militar</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Dias no mês</TableHead>
                <TableHead>Classificação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.postoGraduacao ? `${l.postoGraduacao} ` : ""}{l.militarNome}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.matricula || "—"}</TableCell>
                  <TableCell>{l.periodo}</TableCell>
                  <TableCell>{formatarDataBR(l.dataInicio)}</TableCell>
                  <TableCell>{formatarDataBR(l.dataFim)}</TableCell>
                  <TableCell>{l.diasNoMes}</TableCell>
                  <TableCell><Badge variant="secondary">{l.classificacao}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
