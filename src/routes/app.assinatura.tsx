import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Crown, AlertTriangle, Clock } from "lucide-react";
import { StripeCheckoutButton } from "@/components/stripe-checkout-button";
import { StripeCustomerPortalButton } from "@/components/stripe-customer-portal-button";

export const Route = createFileRoute("/app/assinatura")({
  component: AssinaturaPage,
});

const planos = [
  { id: "monthly" as const, nome: "Mensal", preco: "29,90", desc: "Cobrança mensal", destaque: false },
  { id: "yearly" as const, nome: "Anual", preco: "197", desc: "Cobrança anual — R$ 16,42/mês", destaque: true, badge: "Melhor custo-benefício" },
];

function AssinaturaPage() {
  const { profile, hasAccess, isTrial, trialDaysLeft, isAdmin } = useAuth();

  const expirado = !hasAccess && profile?.subscription_status !== "active";
  const statusLabel: Record<string, string> = {
    trial: "Em teste gratuito",
    active: "Assinatura ativa",
    expired: "Expirada",
    canceled: "Cancelada",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Crown className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Assinatura</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seu plano de acesso ao Comando.
          </p>
        </div>
      </div>

      {/* Status atual */}
      <div className={`panel p-6 ${expirado ? "border-destructive/40" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Status atual</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold">
                {isAdmin
                  ? "Administrador (acesso total)"
                  : statusLabel[profile?.subscription_status ?? "trial"]}
              </h2>
              {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {trialDaysLeft} dia{trialDaysLeft === 1 ? "" : "s"} restante{trialDaysLeft === 1 ? "" : "s"}
                </Badge>
              )}
              {expirado && !isAdmin && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Acesso bloqueado
                </Badge>
              )}
            </div>
            {profile?.trial_end_date && isTrial && (
              <p className="mt-2 text-xs text-muted-foreground">
                Fim do teste: {new Date(profile.trial_end_date).toLocaleDateString("pt-BR")}
              </p>
            )}
            {profile?.subscription_end_date && profile?.subscription_status === "active" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Renova em: {new Date(profile.subscription_end_date).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
        </div>

        {expirado && !isAdmin && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold text-destructive">Seu período de teste expirou</p>
            <p className="mt-1 text-muted-foreground">
              Para continuar gerando, exportando e salvando escalas, escolha um dos planos abaixo.
              Funcionalidades de geração e exportação estão temporariamente bloqueadas.
            </p>
          </div>
        )}
      </div>

      {/* Planos */}
      <div>
        <h2 className="text-xl font-semibold">Escolha seu plano</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique em <strong>Contratar</strong> para ser redirecionado ao checkout seguro do Stripe.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {planos.map((p) => (
            <div
              key={p.id}
              className={`panel relative flex flex-col p-6 ${
                p.destaque ? "border-primary ring-2 ring-primary/40 shadow-[0_0_40px_-10px_var(--primary)]" : ""
              }`}
            >
              {p.destaque && "badge" in p && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  {p.badge}
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.nome}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="text-5xl font-bold tracking-tight">{p.preco}</span>
                <span className="text-sm text-muted-foreground">{p.id === "yearly" ? "/ano" : "/mês"}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {["Escalas ilimitadas", "Exportação Excel e PDF", "Suporte por email", "Atualizações inclusas"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <StripeCheckoutButton
                  planType={p.id}
                  variant={p.destaque ? "default" : "outline"}
                  className="w-full"
                  requireLoginRedirect={false}
                >
                  Contratar {p.nome}
                </StripeCheckoutButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Dúvidas? <Link to="/app/importar" className="text-primary underline">Voltar para o sistema</Link>
      </div>
    </div>
  );
}
