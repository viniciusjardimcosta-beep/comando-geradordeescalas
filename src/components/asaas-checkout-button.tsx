import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  planType: "mensal" | "anual";
  className?: string;
  variant?: "default" | "outline";
  children: React.ReactNode;
  /** Se o usuário não estiver logado, redireciona para /auth com parâmetro do plano. */
  requireLoginRedirect?: boolean;
}

export function AsaasCheckoutButton({
  planType,
  className,
  variant = "default",
  children,
  requireLoginRedirect = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleClick() {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        if (requireLoginRedirect) {
          navigate({ to: "/auth", search: { plan: planType } as never });
          return;
        }
        toast.error("Faça login para assinar.");
        return;
      }

      const res = await fetch("/api/asaas/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan_type: planType }),
      });

      const json = (await res.json()) as { ok?: boolean; checkoutUrl?: string; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Falha ao iniciar assinatura.");
        return;
      }
      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
      } else {
        toast.success("Assinatura criada. Verifique o e-mail com a fatura.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className={className} variant={variant} onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  );
}
