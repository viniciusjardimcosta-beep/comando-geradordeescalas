import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  planType: "mensal" | "anual";
  className?: string;
  variant?: "default" | "outline";
  children: React.ReactNode;
  requireLoginRedirect?: boolean;
}

type BillingForm = { nome: string; cpf_cnpj: string; telefone: string };

export function AsaasCheckoutButton({
  planType,
  className,
  variant = "default",
  children,
  requireLoginRedirect = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BillingForm>({ nome: "", cpf_cnpj: "", telefone: "" });
  const navigate = useNavigate();

  async function postCheckout(token: string, billing?: BillingForm) {
    const res = await fetch("/api/asaas/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan_type: planType, billing }),
    });
    return (await res.json()) as {
      ok?: boolean;
      checkoutUrl?: string;
      error?: string;
      code?: string;
    };
  }

  async function startFlow() {
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

      // Pré-checa perfil para evitar abrir tela inútil
      const userId = sessionData!.session!.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome, cpf, telefone")
        .eq("id", userId)
        .maybeSingle();

      const docDigits = (profile?.cpf ?? "").replace(/\D/g, "");
      const telDigits = (profile?.telefone ?? "").replace(/\D/g, "");
      const needBilling =
        !profile?.nome ||
        !(docDigits.length === 11 || docDigits.length === 14) ||
        telDigits.length < 10;

      if (needBilling) {
        setForm({
          nome: profile?.nome ?? "",
          cpf_cnpj: profile?.cpf ?? "",
          telefone: profile?.telefone ?? "",
        });
        setModalOpen(true);
        return;
      }

      const json = await postCheckout(accessToken);
      handleCheckoutResponse(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleCheckoutResponse(json: { ok?: boolean; checkoutUrl?: string; error?: string; code?: string }) {
    if (!json.ok) {
      if (json.code === "BILLING_REQUIRED") {
        setModalOpen(true);
        return;
      }
      toast.error(json.error ?? "Falha ao iniciar assinatura.");
      return;
    }
    if (json.checkoutUrl) {
      window.location.href = json.checkoutUrl;
    } else {
      toast.success("Assinatura criada. Verifique o e-mail com a fatura.");
    }
  }

  async function submitBilling(e: React.FormEvent) {
    e.preventDefault();
    const nome = form.nome.trim();
    const doc = form.cpf_cnpj.replace(/\D/g, "");
    const tel = form.telefone.replace(/\D/g, "");

    if (!nome) return toast.error("Informe seu nome completo.");
    if (doc.length !== 11 && doc.length !== 14)
      return toast.error("CPF deve ter 11 dígitos ou CNPJ 14 dígitos.");
    if (tel.length < 10) return toast.error("Informe um telefone válido com DDD.");

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const json = await postCheckout(accessToken, {
        nome,
        cpf_cnpj: doc,
        telefone: tel,
      });
      if (json.ok) setModalOpen(false);
      handleCheckoutResponse(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button className={className} variant={variant} onClick={startFlow} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </Button>

      <Dialog open={modalOpen} onOpenChange={(o) => !loading && setModalOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dados de cobrança</DialogTitle>
            <DialogDescription>
              Para contratar um plano, informe seus dados de cobrança. Eles são necessários para
              emissão da cobrança no Asaas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitBilling} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bill-nome">Nome completo</Label>
              <Input
                id="bill-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-doc">CPF ou CNPJ</Label>
              <Input
                id="bill-doc"
                value={form.cpf_cnpj}
                onChange={(e) => setForm((f) => ({ ...f, cpf_cnpj: e.target.value }))}
                placeholder="Somente números"
                required
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-tel">Telefone (com DDD)</Label>
              <Input
                id="bill-tel"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                placeholder="Ex: 11999998888"
                required
                maxLength={20}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
