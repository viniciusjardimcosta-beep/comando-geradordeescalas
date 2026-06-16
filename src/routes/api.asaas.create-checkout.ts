import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  findOrCreateAsaasCustomer,
  createAsaasSubscription,
  getFirstSubscriptionPayment,
} from "@/lib/asaas.server";

// POST /api/asaas/create-checkout
// Body: { plan_type: "mensal" | "anual" }
// Header: Authorization: Bearer <supabase access token>
// Retorna: { checkoutUrl, subscriptionId, paymentId }

export const Route = createFileRoute("/api/asaas/create-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) {
            return Response.json({ ok: false, error: "Não autenticado" }, { status: 401 });
          }

          const supabaseUrl = process.env.SUPABASE_URL!;
          const supabasePub = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabaseAuth = createClient(supabaseUrl, supabasePub, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser(token);
          if (userErr || !userRes?.user) {
            return Response.json({ ok: false, error: "Sessão inválida" }, { status: 401 });
          }
          const user = userRes.user;

          const body = await request.json().catch(() => ({})) as { plan_type?: string };
          const planRaw = (body.plan_type ?? "").toLowerCase();
          if (planRaw !== "mensal" && planRaw !== "anual") {
            return Response.json({ ok: false, error: "plan_type inválido" }, { status: 400 });
          }
          const planType = planRaw as "mensal" | "anual";

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("nome, email, cpf, telefone")
            .eq("id", user.id)
            .maybeSingle();

          const customer = await findOrCreateAsaasCustomer({
            name: profile?.nome ?? user.email ?? "Cliente Comando",
            email: profile?.email ?? user.email ?? "",
            cpfCnpj: profile?.cpf ?? null,
            mobilePhone: profile?.telefone ?? null,
            externalReference: user.id,
          });

          const subscription = await createAsaasSubscription({
            customerId: customer.id,
            planType,
            externalReference: user.id,
          });

          // Persistir registro inicial
          await supabaseAdmin.from("asaas_subscriptions").upsert({
            user_id: user.id,
            customer_id: customer.id,
            subscription_id: subscription.id,
            plan_type: planType,
            value: subscription.value,
            status: subscription.status,
            billing_type: subscription.billingType,
            next_due_date: subscription.nextDueDate,
            cycle: subscription.cycle,
            raw_payload: subscription as unknown as Record<string, unknown>,
          }, { onConflict: "subscription_id" });

          // Buscar primeira cobrança para extrair invoiceUrl
          let checkoutUrl: string | null = null;
          let paymentId: string | null = null;
          try {
            const payment = await getFirstSubscriptionPayment(subscription.id);
            if (payment) {
              paymentId = payment.id;
              checkoutUrl = payment.invoiceUrl ?? payment.bankSlipUrl ?? null;
              await supabaseAdmin
                .from("asaas_subscriptions")
                .update({ payment_id: payment.id })
                .eq("subscription_id", subscription.id);
            }
          } catch (e) {
            console.warn("[Asaas] falha ao obter primeira cobrança", e);
          }

          // Fallback: URL pública da fatura por id
          if (!checkoutUrl && paymentId) {
            checkoutUrl = `https://www.asaas.com/i/${paymentId.replace(/^pay_/, "")}`;
          }

          return Response.json({
            ok: true,
            checkoutUrl,
            subscriptionId: subscription.id,
            paymentId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Asaas/create-checkout]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
