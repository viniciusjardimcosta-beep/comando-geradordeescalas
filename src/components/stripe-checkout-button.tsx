import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  planType: "monthly" | "yearly";
  className?: string;
  variant?: "default" | "outline";
  children: React.ReactNode;
  requireLoginRedirect?: boolean;
}

export function StripeCheckoutButton({
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
          navigate({ to: "/auth" });
          return;
        }
        toast.error("Faça login para assinar.");
        return;
      }

      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ planType }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Falha ao iniciar checkout.");
        return;
      }

      const url = json.url;
      const inIframe = typeof window !== "undefined" && window.self !== window.top;
      if (inIframe) {
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          toast.message("Permita pop-ups para abrir o checkout.", {
            action: { label: "Abrir", onClick: () => window.open(url, "_blank", "noopener,noreferrer") },
          });
        }
      } else {
        window.location.href = url;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
