import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Clock, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/aguardando")({
  component: AguardandoPage,
});

function AguardandoPage() {
  const { profile, signOut, loading } = useAuth();

  if (loading) return null;
  if (!profile) return <Navigate to="/auth" />;
  if (profile.status === "aprovado") return <Navigate to="/app/importar" />;

  const bloqueado = profile.status === "bloqueado";
  const Icon = bloqueado ? ShieldOff : Clock;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md p-10 text-center">
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${bloqueado ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
          <Icon className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold">
          {bloqueado ? "Acesso bloqueado" : "Cadastro aguardando aprovação"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {bloqueado
            ? "Sua conta foi bloqueada pelo administrador. Entre em contato para mais informações."
            : "Cadastro aguardando aprovação do administrador."}
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{profile.email}</p>
        <Button onClick={signOut} variant="outline" className="mt-6">
          Sair
        </Button>
      </div>
    </div>
  );
}
