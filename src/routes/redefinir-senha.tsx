import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { finalizarSenhaTemporaria } from "@/lib/auth/finalizarSenhaTemporaria";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/redefinir-senha")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [ready, setReady] = useState(false);


  useEffect(() => {
    // Supabase processa o token automaticamente do hash da URL
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Caso já tenha sessão de recuperação:
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      z.string().min(6, "Mínimo 6 caracteres").max(72).parse(pass);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0].message);
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    // Senha alterada com sucesso: só agora concluímos a senha temporária,
    // e somente com confirmação real do banco (sem falso sucesso).
    const res = await finalizarSenhaTemporaria(supabase);
    if (!res.ok) {
      setBusy(false);
      setPendente(true);
      toast.error(
        "Senha alterada, mas a conclusão do acesso não foi confirmada. Clique em \"Concluir acesso\" para tentar novamente.",
      );
      return;
    }

    await refresh();
    setBusy(false);
    toast.success("Senha atualizada!");
    navigate({ to: "/" });
  };

  const handleConcluir = async () => {
    setBusy(true);
    const res = await finalizarSenhaTemporaria(supabase);
    if (!res.ok) {
      setBusy(false);
      toast.error("Ainda não foi possível concluir o acesso. Tente novamente em instantes.");
      return;
    }
    await refresh();
    setBusy(false);
    setPendente(false);
    toast.success("Acesso liberado!");
    navigate({ to: "/" });
  };


  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Definir nova senha</h1>
        </div>
        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            Abrindo link de recuperação...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pass">Nova senha</Label>
              <Input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
