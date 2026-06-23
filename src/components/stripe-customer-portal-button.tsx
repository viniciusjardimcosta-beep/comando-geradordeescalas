import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function StripeCustomerPortalButton() {
  const [hasCustomer, setHasCustomer] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("stripe_subscriptions")
        .select("customer_id")
        .eq("user_id", userId)
        .not("customer_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (active && data?.customer_id) setHasCustomer(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!hasCustomer) return null;

  async function handleClick() {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        toast.error("Faça login novamente.");
        return;
      }
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Falha ao abrir portal.");
        return;
      }
      const inIframe = typeof window !== "undefined" && window.self !== window.top;
      if (inIframe) {
        const win = window.open(json.url, "_blank", "noopener,noreferrer");
        if (!win) toast.message("Permita pop-ups para abrir o portal.");
      } else {
        window.location.href = json.url;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
      Gerenciar assinatura
    </Button>
  );
}
