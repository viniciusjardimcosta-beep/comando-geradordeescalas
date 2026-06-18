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

          const body = await request.json().catch(() => ({})) as {
            plan_type?: string;
            billing?: { nome?: string; cpf_cnpj?: string; telefone?: string };
          };
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

          let nome = profile?.nome ?? "";
          let cpfDigits = (profile?.cpf ?? "").replace(/\D/g, "");
          let telefone = (profile?.telefone ?? "").replace(/\D/g, "");

          // Aceita dados de cobrança vindos do modal e atualiza o perfil
          if (body.billing) {
            const bNome = (body.billing.nome ?? "").trim();
            const bDoc = (body.billing.cpf_cnpj ?? "").replace(/\D/g, "");
            const bTel = (body.billing.telefone ?? "").replace(/\D/g, "");
            if (bNome) nome = bNome;
            if (bDoc.length === 11 || bDoc.length === 14) cpfDigits = bDoc;
            if (bTel.length >= 10) telefone = bTel;

            await supabaseAdmin
              .from("profiles")
              .update({
                nome: nome || profile?.nome || user.email,
                cpf: cpfDigits || profile?.cpf,
                telefone: telefone || profile?.telefone,
              })
              .eq("id", user.id);
          }

          if (!cpfDigits || (cpfDigits.length !== 11 && cpfDigits.length !== 14)) {
            return Response.json(
              {
                ok: false,
                error: "Informe seus dados de cobrança para contratar um plano.",
                code: "BILLING_REQUIRED",
                missing: {
                  nome: !nome,
                  cpf_cnpj: true,
                  telefone: !telefone || telefone.length < 10,
                },
              },
              { status: 400 },
            );
          }

          if (!telefone || telefone.length < 10) {
            return Response.json(
              {
                ok: false,
                error: "Informe seus dados de cobrança para contratar um plano.",
                code: "BILLING_REQUIRED",
                missing: { nome: !nome, cpf_cnpj: false, telefone: true },
              },
              { status: 400 },
            );
          }

          if (!nome) {
            return Response.json(
              {
                ok: false,
                error: "Informe seus dados de cobrança para contratar um plano.",
                code: "BILLING_REQUIRED",
                missing: { nome: true, cpf_cnpj: false, telefone: false },
              },
              { status: 400 },
            );
          }

          const customer = await findOrCreateAsaasCustomer({
            name: nome || user.email || "Cliente Comando",
            email: profile?.email ?? user.email ?? "",
            cpfCnpj: cpfDigits,
            mobilePhone: telefone || null,
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
          } as never, { onConflict: "subscription_id" });

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
