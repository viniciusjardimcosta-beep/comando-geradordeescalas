import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  Loader2,
  CalendarClock,
  Clock,
  Shuffle,
  UserMinus,
  Users,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  UserPlus,
  Settings2,
  Upload,
  Sparkles,
  Download,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsaasCheckoutButton } from "@/components/asaas-checkout-button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comando — Gerenciamento Inteligente de Escalas Operacionais" },
      {
        name: "description",
        content:
          "Automatize escalas, reduza erros operacionais e economize horas de trabalho administrativo com o Comando.",
      },
      { property: "og:title", content: "Comando — Gerenciamento Inteligente de Escalas" },
      {
        property: "og:description",
        content: "Plataforma SaaS para geração automática de escalas operacionais.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Usuário logado: encaminhar para a área correta
  if (session) {
    if (profile?.status === "pendente" || profile?.status === "bloqueado") {
      return <Navigate to="/aguardando" />;
    }
    return <Navigate to="/app/importar" />;
  }

  // Visitante: renderizar landing page
  return <Landing />;
}

function Landing() {
  return (
    <div className="min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight">COMANDO</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#beneficios" className="transition-colors hover:text-foreground">Benefícios</a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
            <a href="#planos" className="transition-colors hover:text-foreground">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" search={{ tab: "login" }}>
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/auth" search={{ tab: "signup" }}>
              <Button size="sm">Começar agora</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%),radial-gradient(circle_at_80%_30%,color-mix(in_oklab,oklch(0.55_0.18_240)_22%,transparent),transparent_60%)]" />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Plataforma SaaS de gestão de escalas
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Gerenciamento{" "}
              <span className="bg-gradient-to-r from-primary to-[oklch(0.65_0.18_240)] bg-clip-text text-transparent">
                Inteligente
              </span>{" "}
              de Escalas Operacionais
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Automatize escalas, reduza erros operacionais e economize horas de trabalho
              administrativo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" search={{ tab: "signup" }}>
                <Button size="lg">Começar agora</Button>
              </Link>
              <Link to="/auth" search={{ tab: "login" }}>
                <Button size="lg" variant="outline">Entrar</Button>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Sem instalação</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 100% na nuvem</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Exporta Excel e PDF</span>
            </div>
          </div>

          {/* Mock visual */}
          <div className="relative">
            <div className="panel relative overflow-hidden rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                </div>
                <span className="text-xs text-muted-foreground font-mono">escala_dezembro.xlsx</span>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] font-mono">
                {Array.from({ length: 35 }).map((_, i) => {
                  const tones = [
                    "bg-primary/25 text-foreground",
                    "bg-card text-muted-foreground",
                    "bg-[oklch(0.55_0.18_240)]/25 text-foreground",
                    "bg-card text-muted-foreground",
                    "bg-warning/20 text-foreground",
                  ];
                  const t = tones[i % tones.length];
                  return (
                    <div key={i} className={`rounded-md ${t} aspect-square flex items-center justify-center`}>
                      {((i % 28) + 1).toString().padStart(2, "0")}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Escala gerada em 4s</span>
                <span className="text-muted-foreground font-mono">42 militares · 31 dias</span>
              </div>
            </div>
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-[oklch(0.55_0.18_240)]/20 blur-2xl" />
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section id="beneficios" className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Tudo que sua gestão precisa</h2>
            <p className="mt-3 text-muted-foreground">
              Recursos pensados para eliminar planilhas manuais e acelerar o trabalho da administração.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: CalendarClock, t: "Geração inteligente de escalas", d: "Distribuição automática respeitando regras operacionais." },
              { icon: Clock, t: "Controle de carga horária", d: "Acompanhe horas trabalhadas e proporcional mensal." },
              { icon: Shuffle, t: "Distribuição automática de HE", d: "Horas extras alocadas de forma equilibrada." },
              { icon: UserMinus, t: "Gestão de afastamentos", d: "Férias, licenças e impedimentos integrados." },
              { icon: Users, t: "Controle de CG e COV", d: "Comandante e condutor sempre presentes na guarnição." },
              { icon: FileSpreadsheet, t: "Exportação Excel e PDF", d: "Saída pronta para impressão e arquivamento." },
              { icon: ShieldCheck, t: "Redução de erros manuais", d: "Validações automáticas evitam retrabalho." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="panel group p-6 transition-all hover:border-primary/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Em 5 passos sua escala está pronta.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {[
              { icon: UserPlus, t: "Cadastre os militares" },
              { icon: Settings2, t: "Configure guarnições" },
              { icon: Upload, t: "Importe a planilha" },
              { icon: Sparkles, t: "Gere a escala automaticamente" },
              { icon: Download, t: "Exporte em Excel ou PDF" },
            ].map((s, i) => (
              <div key={s.t} className="panel relative p-5">
                <div className="absolute -top-3 left-5 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <s.icon className="mt-2 h-6 w-6 text-primary" />
                <p className="mt-3 text-sm font-medium">{s.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ENTREGAS DO SISTEMA */}
      <section id="entregas" className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Entregas do sistema
            </div>
            <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
              Veja o que o sistema entrega em poucos segundos
            </h2>
            <p className="mt-4 text-muted-foreground">
              Muito mais do que gerar uma escala. O sistema identifica automaticamente os dias com efetivo
              incompleto e entrega relatórios profissionais para facilitar o trabalho do escalante.
            </p>
          </div>

          {/* Fluxo de entregas */}
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {/* 1 — Excel */}
            <div className="panel group relative flex flex-col overflow-hidden p-6 transition-all hover:border-primary/40">
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
              {/* Mockup notebook */}
              <div className="relative mx-auto mt-2 w-full max-w-sm">
                <div className="rounded-t-xl border border-border bg-[#1c1f2a] p-2 shadow-2xl">
                  <div className="mb-1.5 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-warning/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-success/70" />
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <div className="mb-1 flex items-center gap-1 text-[8px] font-mono text-slate-500">
                      <FileSpreadsheet className="h-2.5 w-2.5 text-emerald-600" />
                      escala_dezembro.xlsx
                    </div>
                    <div className="grid grid-cols-8 gap-[1px] bg-slate-200">
                      {Array.from({ length: 48 }).map((_, i) => (
                        <div
                          key={i}
                          className={`aspect-[2/1] text-[6px] font-mono flex items-center justify-center ${
                            i < 8 ? "bg-emerald-600 text-white font-bold" :
                            i % 8 === 0 ? "bg-slate-100 text-slate-700" :
                            "bg-white text-slate-600"
                          }`}
                        >
                          {i < 8 ? ["D","M","T","Q","Q","S","S","T"][i] : ((i * 7) % 24).toString().padStart(2, "0")}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* base do notebook */}
                <div className="mx-auto h-2 w-[110%] -translate-x-[5%] rounded-b-xl bg-[#0f1218]" />
              </div>
              <h3 className="mt-6 text-center text-lg font-semibold">Escala completa em Excel</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Escala pronta para utilização, impressão e distribuição.
              </p>
            </div>

            {/* 2 — PDF Furos */}
            <div className="panel group relative flex flex-col overflow-hidden p-6 transition-all hover:border-primary/40">
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
              {/* Mockup tablet */}
              <div className="relative mx-auto mt-2 w-full max-w-[240px]">
                <div className="rounded-2xl border-4 border-[#1c1f2a] bg-white shadow-2xl">
                  <div className="rounded-lg bg-white p-2">
                    <div className="rounded-t-sm bg-primary px-2 py-1.5">
                      <div className="text-[7px] font-bold text-primary-foreground">COMANDO GERADOR DE ESCALAS</div>
                    </div>
                    <div className="mt-1.5 px-1">
                      <div className="text-[8px] font-bold text-slate-800">Relatório de Furos de Efetivo</div>
                      <div className="mt-0.5 h-0.5 w-8 bg-primary" />
                      <div className="mt-1 text-[6px] text-slate-500">Escala: Dezembro / 2026</div>
                    </div>
                    <div className="mt-1.5 rounded bg-slate-50 p-1.5">
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {["17","17","0","0"].map((n, i) => (
                          <div key={i}>
                            <div className="text-[9px] font-bold text-primary">{n}</div>
                            <div className="text-[5px] text-slate-500">{["Dias","Falt.","CG","COV"][i]}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 space-y-[1px]">
                      <div className="grid grid-cols-5 gap-[1px] bg-primary text-[5px] font-bold text-primary-foreground">
                        {["Dia","Esc.","Falt.","CG","COV"].map((h) => (
                          <div key={h} className="px-1 py-0.5 text-center">{h}</div>
                        ))}
                      </div>
                      {[["02","3","1","1","2"],["03","3","1","2","2"],["08","3","1","1","1"]].map((r, i) => (
                        <div key={i} className={`grid grid-cols-5 gap-[1px] text-[5px] ${i % 2 ? "bg-slate-50" : "bg-white"}`}>
                          {r.map((c, j) => (
                            <div key={j} className="px-1 py-0.5 text-center text-slate-700">{c}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="mt-6 text-center text-lg font-semibold">Relatório de Furos de Efetivo</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Identifique rapidamente os dias que precisam de ajustes.
              </p>
            </div>

            {/* 3 — Resumo */}
            <div className="panel group relative flex flex-col overflow-hidden p-6 transition-all hover:border-primary/40">
              <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
              {/* Mockup monitor */}
              <div className="relative mx-auto mt-2 w-full max-w-sm">
                <div className="rounded-lg border-2 border-[#1c1f2a] bg-white p-3 shadow-2xl">
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Resumo inteligente</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { n: "17", l: "Dias com furos", c: "warning" },
                      { n: "17", l: "Militares faltantes", c: "warning" },
                      { n: "0", l: "Dias sem CG", c: "success" },
                      { n: "0", l: "Dias sem COV", c: "success" },
                    ].map((it) => (
                      <div key={it.l} className={`rounded-md p-2 ${it.c === "success" ? "bg-success/10" : "bg-warning/10"}`}>
                        <div className={`text-2xl font-bold ${it.c === "success" ? "text-success" : "text-warning"}`}>{it.n}</div>
                        <div className="text-[9px] text-slate-600">{it.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-auto mt-1 h-1.5 w-16 rounded-b-md bg-[#0f1218]" />
              </div>
              <h3 className="mt-6 text-center text-lg font-semibold">Resumo Inteligente</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                O sistema resume automaticamente todas as pendências da escala.
              </p>
            </div>
          </div>

          {/* Comparativo */}
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            <div className="panel border-destructive/30 p-6">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-destructive">Antes</div>
              <h3 className="text-lg font-bold">Fluxo manual</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {[
                  "Conferir toda a planilha manualmente",
                  "Procurar onde faltou militar",
                  "Identificar dias sem CG",
                  "Identificar dias sem COV",
                  "Fazer anotações manuais",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-0.5 text-destructive">✕</span> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <Clock className="h-4 w-4 text-destructive" />
                <span className="text-muted-foreground">Tempo médio:</span>
                <strong className="text-destructive">2 a 3 horas</strong>
              </div>
            </div>

            <div className="panel border-success/40 bg-gradient-to-br from-success/5 to-transparent p-6">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-success">Depois</div>
              <h3 className="text-lg font-bold">Com o Comando</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {[
                  "Gerar a escala",
                  "Baixar o Excel",
                  "Baixar o Relatório de Furos",
                  "Ajustar apenas os dias indicados",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm">
                <Zap className="h-4 w-4 text-success" />
                <span className="text-muted-foreground">Tempo médio:</span>
                <strong className="text-success">Menos de 5 minutos</strong>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-transparent to-[oklch(0.55_0.18_240)]/15 p-10 text-center">
            <h3 className="text-2xl font-bold tracking-tight md:text-3xl">Gere sua escala em minutos</h3>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Deixe que o sistema identifique automaticamente tudo o que precisa de atenção para que você concentre
              seu tempo apenas nos ajustes necessários.
            </p>
            <div className="mt-6">
              <Link to="/auth" search={{ tab: "signup" }}>
                <Button size="lg" className="px-8">Começar agora</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Planos</h2>
            <p className="mt-3 text-muted-foreground">Escolha o ciclo que faz mais sentido para sua operação.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
            {/* Mensal */}
            <div className="panel relative flex flex-col p-6">
              <h3 className="text-lg font-semibold">Plano Mensal</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ideal para quem deseja gerar escalas de forma rápida e sem compromisso de longo prazo.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="text-5xl font-bold tracking-tight">29,90</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {[
                  "Geração automática de escalas",
                  "Exportação para planilha",
                  "Controle de férias e afastamentos",
                  "Controle de carga horária",
                  "Suporte por e-mail",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <AsaasCheckoutButton planType="mensal" variant="outline" className="w-full">
                  Assinar Plano Mensal
                </AsaasCheckoutButton>
              </div>
            </div>

            {/* Anual destaque */}
            <div className="panel relative flex flex-col overflow-hidden border-primary p-6 ring-2 ring-primary/40 shadow-[0_0_40px_-10px_var(--primary)] bg-gradient-to-br from-primary/10 via-transparent to-[oklch(0.55_0.18_240)]/10">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                ⭐ MAIS ESCOLHIDO
              </span>
              <h3 className="text-lg font-semibold">Plano Anual</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                A melhor opção para quem gera escalas regularmente e deseja o menor custo possível.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="text-5xl font-bold tracking-tight">197</span>
                <span className="text-sm text-muted-foreground">/ano</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Apenas <strong className="text-foreground">R$ 16,42 por mês</strong>
              </p>
              <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                Economize R$ 161,80 por ano em comparação ao plano mensal
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {[
                  "Tudo do plano mensal",
                  "Menor custo mensal",
                  "Atualizações incluídas",
                  "Melhor custo-benefício",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <AsaasCheckoutButton planType="anual" className="w-full">
                  Assinar Plano Anual
                </AsaasCheckoutButton>
              </div>
            </div>
          </div>

          {/* Benefício */}
          <div className="panel mx-auto mt-12 max-w-4xl p-8">
            <h3 className="text-xl font-bold tracking-tight">Quanto tempo você gasta montando uma escala manualmente?</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              O <strong className="text-primary">Scale Master</strong> automatiza férias, afastamentos, carga horária, horas extras e distribuição das guarnições, reduzindo horas de trabalho para poucos minutos.
            </p>
          </div>

          {/* Economia */}
          <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-[oklch(0.55_0.18_240)]/15 p-8 text-center">
            <p className="text-sm font-semibold text-primary">💡 Menos de R$ 0,55 por dia</p>
            <p className="mt-3 text-2xl font-bold tracking-tight">Plano Anual: R$ 197 por ano</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Equivalente a <strong className="text-foreground">R$ 16,42 por mês</strong> ou <strong className="text-foreground">R$ 0,54 por dia</strong>
            </p>
          </div>

          <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-muted-foreground">
            Todos os planos possuem acesso completo às funcionalidades do sistema. A diferença está apenas na forma de cobrança e na economia obtida pelo período contratado.
          </p>
        </div>
      </section>


      {/* RODAPÉ */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-foreground">COMANDO</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-foreground">Termos</a>
            <a href="#" className="transition-colors hover:text-foreground">Privacidade</a>
            <a href="#" className="transition-colors hover:text-foreground">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
