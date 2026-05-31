import { createFileRoute, Outlet, Link, Navigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, FileSpreadsheet, Users, LogOut, Loader2, UserSquare2, Plane, ListOrdered, Crown, AlertTriangle, Clock } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile, isAdmin, isApproved, hasAccess, isTrial, trialDaysLeft, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" />;
  if (profile?.password_temporary && location.pathname !== "/redefinir-senha") {
    return <Navigate to="/redefinir-senha" />;
  }
  if (!isApproved) return <Navigate to="/aguardando" />;


  const tabs = [
    { to: "/app/importar", label: "Importar planilha", icon: FileSpreadsheet, show: true },
    { to: "/app/militares", label: "Militares", icon: UserSquare2, show: true },
    { to: "/app/escalas", label: "Escalas Ordinárias", icon: ListOrdered, show: true },
    { to: "/app/ferias", label: "Plano de Férias", icon: Plane, show: true },
    { to: "/app/assinatura", label: "Assinatura", icon: Crown, show: true },
    { to: "/app/usuarios", label: "Gerenciar usuários", icon: Users, show: isAdmin },
  ];

  const mostrarBannerTrial = isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && trialDaysLeft <= 7;
  const mostrarBannerBloqueio = !hasAccess && !isAdmin;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-wide">COMANDO</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Gerador de Escalas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{profile?.nome ?? profile?.email}</p>
              <div className="flex items-center justify-end gap-2">
                <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px]">
                  {isAdmin ? "ADMIN" : "USUÁRIO"}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.filter((t) => t.show).map((t) => {
            const Icon = t.icon;
            const active = location.pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {mostrarBannerBloqueio && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Seu período de teste expirou</p>
                <p className="text-muted-foreground">Geração e exportação de escalas estão bloqueadas. Assine um plano para continuar.</p>
              </div>
            </div>
            <Link to="/app/assinatura">
              <Button size="sm">Ver planos</Button>
            </Link>
          </div>
        )}
        {!mostrarBannerBloqueio && mostrarBannerTrial && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>
                <strong>{trialDaysLeft}</strong> dia{trialDaysLeft === 1 ? "" : "s"} restante{trialDaysLeft === 1 ? "" : "s"} no seu teste gratuito.
              </span>
            </div>
            <Link to="/app/assinatura">
              <Button size="sm" variant="outline">Ver planos</Button>
            </Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
