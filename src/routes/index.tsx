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
            <Link to="/auth">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Criar conta</Button>
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
              <Link to="/auth">
                <Button size="lg">Criar conta</Button>
              </Link>
              <Link to="/auth">
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
