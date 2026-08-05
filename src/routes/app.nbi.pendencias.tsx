// Bloco 12 — Painel de Pendências NBI (somente leitura + ações sugeridas).
// Nenhuma ação aqui gera documento, reserva número ou altera registros.
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CalendarClock, UserCheck, Clock, AlertTriangle, Lightbulb, History } from "lucide-react";
import { formatarDataBR } from "@/utils/nbi";
import {
  apresentacoesPendentes, substituicoesPendentes, folgasPrevistas,
  avaliarConsistenciaNbi,
} from "@/lib/nbi/consistencia";
import { useBaseConsistencia } from "@/lib/nbi/consistencia/carregar";
import { LinhaDoTempoMilitar } from "@/components/nbi/LinhaDoTempoMilitar";

export const Route = createFileRoute("/app/nbi/pendencias")({
  component: PendenciasPage,
  head: () => ({
    meta: [
      { title: "Pendências NBI — Comando" },
      { name: "description", content: "Apresentações pendentes, assunções abertas, dispensas previstas, folgas e conflitos institucionais do módulo NBI." },
      { property: "og:title", content: "Pendências NBI — Comando" },
      { property: "og:description", content: "Painel de pendências e consistência institucional do módulo NBI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Severidade = "todas" | "bloqueio" | "alerta" | "sugestao";

function PendenciasPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { base, carregando } = useBaseConsistencia(session?.user.id);

  const [filtroMilitar, setFiltroMilitar] = useState("");
  const [severidade, setSeveridade] = useState<Severidade>("todas");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [timelineMilitar, setTimelineMilitar] = useState<string | null>(null);

  const militarMatch = (nome: string | null | undefined) =>
    !filtroMilitar.trim() || (nome ?? "").toLowerCase().includes(filtroMilitar.trim().toLowerCase());
  const periodoMatch = (data: string | null | undefined) =>
    !data || ((!de || data >= de) && (!ate || data <= ate));

  const apresentacoes = useMemo(
    () => apresentacoesPendentes(base).filter((p) => militarMatch(p.militarNome) && periodoMatch(p.dataApresentacao)),
    [base, filtroMilitar, de, ate],
  );
  const substituicoes = useMemo(
    () => substituicoesPendentes(base).filter((s) => militarMatch(s.substitutoNome) && periodoMatch(s.data_fim_prevista)),
    [base, filtroMilitar, de, ate],
  );
  const folgas = useMemo(
    () => folgasPrevistas(base).filter((f) => militarMatch(f.militarNome) && !f.realizada && f.quando !== "outro"),
    [base, filtroMilitar],
  );

  // Conflitos e alertas cronológicos: avaliação em lote sobre os assuntos já documentados.
  const conflitos = useMemo(() => {
    const out: Array<{ militar: string | null; achado: ReturnType<typeof avaliarConsistenciaNbi>["alertas"][number] }> = [];
    for (const d of base.documentos) {
      if (d.canceled_at || d.status !== "gerado") continue;
      for (const a of d.assuntos) {
        if (!a.militar_id) continue;
        const nome = base.militares.find((m) => m.id === a.militar_id)?.nome ?? null;
        if (!militarMatch(nome)) continue;
        const r = avaliarConsistenciaNbi({
          militarId: a.militar_id,
          tipoAssunto: a.tipo,
          subtipo: a.subtipo ?? null,
          campos: a.campos,
          dataDocumento: d.data_documento,
          documentoId: d.id,
          substituicaoId: a.substituicao_id ?? null,
          militarTitularId: a.militar_titular_id ?? null,
          base,
        });
        for (const achado of [...r.bloqueios, ...r.alertas]) {
          if (severidade !== "todas" && achado.severidade !== severidade) continue;
          out.push({ militar: nome, achado });
        }
      }
    }
    return out.slice(0, 100);
  }, [base, filtroMilitar, severidade]);

  const mostrar = (sev: "bloqueio" | "alerta" | "sugestao") => severidade === "todas" || severidade === sev;

  if (carregando) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pendências…</div>;
  }

  return (
    <div className="space-y-4" data-testid="painel-pendencias">
      <div>
        <h1 className="text-xl font-bold">Pendências NBI</h1>
        <p className="text-sm text-muted-foreground">
          Consulta somente leitura. Nenhuma nota é gerada e nenhum número é reservado automaticamente.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="text-xs text-muted-foreground">Militar</label>
            <Input data-testid="filtro-militar" value={filtroMilitar} onChange={(e) => setFiltroMilitar(e.target.value)} placeholder="Nome do militar" className="h-8 w-56" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Severidade</label>
            <select
              data-testid="filtro-severidade"
              className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm"
              value={severidade}
              onChange={(e) => setSeveridade(e.target.value as Severidade)}
            >
              <option value="todas">Todas</option>
              <option value="bloqueio">Bloqueio</option>
              <option value="alerta">Alerta</option>
              <option value="sugestao">Sugestão</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8 w-[9.5rem]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8 w-[9.5rem]" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {mostrar("sugestao") && (
          <Card data-testid="card-apresentacoes">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" /> Apresentações pendentes <Badge variant="secondary">{apresentacoes.length}</Badge></CardTitle>
              <CardDescription>Afastamento encerrado, data esperada alcançada e nenhuma apresentação ativa vinculada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {apresentacoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma pendência.</p>}
              {apresentacoes.map((p) => (
                <div key={`${p.militar_id}-${p.dataApresentacao}`} className="rounded-md border p-2 text-sm" data-testid="item-apresentacao-pendente">
                  <p className="font-medium">
                    Apresentação pendente para {p.militarNome}, referente a {p.tipoAfastamento.toLowerCase()}, encerrado em {formatarDataBR(p.fim)}.
                  </p>
                  <p className="text-[11px] text-muted-foreground">Esperada em {formatarDataBR(p.dataApresentacao)} · Origem: {p.origem}{p.documento_origem ? ` · ${p.documento_origem}` : ""}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate({ to: "/app/nbi/nova", search: { sugestao: "apresentacao", militar: p.militar_id, ferias: p.ferias_id ?? undefined } as never })}>
                      Gerar apresentação
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setTimelineMilitar(p.militar_id)}><History className="mr-1 h-3 w-3" /> Linha do tempo</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-substituicoes">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> Assunções abertas e dispensas previstas <Badge variant="secondary">{substituicoes.length}</Badge></CardTitle>
            <CardDescription>Estados: sem previsão, previsão futura, prevista hoje e atrasada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {substituicoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma assunção aberta.</p>}
            {substituicoes.map((s) => (
              <div key={s.id} className="rounded-md border p-2 text-sm" data-testid="item-substituicao" data-estado={s.estado}>
                <p className="font-medium">{s.mensagem}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.funcao ?? "Função"} · Substituto: {s.substitutoNome ?? "—"} · Titular: {s.titularNome ?? "—"}
                  {s.documento_assuncao ? ` · ${s.documento_assuncao}` : ""}
                </p>
                {(s.estado === "dispensa_hoje" || s.estado === "dispensa_atrasada") && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate({ to: "/app/nbi/nova", search: { sugestao: "dispensa", substituicao: s.id } as never })}>
                    Gerar Dispensa
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="card-folgas">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Folgas previstas <Badge variant="secondary">{folgas.length}</Badge></CardTitle>
            <CardDescription>Somente o que os dados suportam — o sistema não marca folga como atrasada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {folgas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma folga prevista para este mês ou o próximo.</p>}
            {folgas.map((f, i) => (
              <div key={`${f.militar_id}-${i}`} className="rounded-md border p-2 text-sm" data-testid="item-folga" data-quando={f.quando}>
                <p>{f.horas} horas previstas para compensação em {f.mesCompensacao} de {f.anoCompensacao}.</p>
                <p className="text-[11px] text-muted-foreground">{f.militarNome ?? "—"} · referência: {f.mesReferencia} · {f.documento}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="card-conflitos">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Conflitos e alertas cronológicos <Badge variant="secondary">{conflitos.length}</Badge></CardTitle>
            <CardDescription>Avaliação em lote dos documentos já emitidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflitos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum conflito identificado.</p>}
            {conflitos.map((c, i) => (
              <div key={`${c.achado.regra}-${i}`} className="rounded-md border p-2 text-xs" data-testid="item-conflito" data-severidade={c.achado.severidade}>
                <p className="font-medium">{c.militar ?? "—"} · {c.achado.titulo}</p>
                <p className="text-muted-foreground">{c.achado.motivo}</p>
                <p className="text-[11px] text-muted-foreground">Origem: {c.achado.origem} · Ação: {c.achado.acaoSugerida}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {mostrar("sugestao") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" /> Linha do tempo documental</CardTitle>
            <CardDescription>Selecione um militar para consultar o histórico com recorte por período.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
              value={timelineMilitar ?? ""}
              onChange={(e) => setTimelineMilitar(e.target.value || null)}
              data-testid="seletor-timeline"
            >
              <option value="">Selecione um militar…</option>
              {base.militares.filter((m) => m.ativo).map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            {timelineMilitar && <LinhaDoTempoMilitar base={base} militarId={timelineMilitar} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
