import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getStripe, priceIdForPlan } from "@/lib/stripe.server";

// POST /api/stripe/create-checkout
// Body: { planType: "monthly" | "yearly" }
// Header: Authorization: Bearer <supabase access token>
// Retorna: { url }

const SITE_URL = "https://comandogeradordeescalas.com.br";

export const Route = createFileRoute("/api/stripe/create-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) {
            return Response.json({ error: "Não autenticado" }, { status: 401 });
          }

          const supabaseUrl = process.env.SUPABASE_URL!;
          const supabasePub = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabaseAuth = createClient(supabaseUrl, supabasePub, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser(token);
          if (userErr || !userRes?.user) {
            return Response.json({ error: "Sessão inválida" }, { status: 401 });
          }
          const user = userRes.user;

          const body = (await request.json().catch(() => ({}))) as {
            planType?: string;
          };
          const plan = (body.planType ?? "").toLowerCase();
          if (plan !== "monthly" && plan !== "yearly") {
            return Response.json({ error: "planType inválido" }, { status: 400 });
          }
          const planType = plan as "monthly" | "yearly";

          const stripe = getStripe();
          const price = priceIdForPlan(planType);

          // Tenta reutilizar customer_id já salvo
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: existing } = await supabaseAdmin
            .from("stripe_subscriptions")
            .select("customer_id")
            .eq("user_id", user.id)
            .not("customer_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const customerId = (existing as { customer_id?: string } | null)?.customer_id ?? undefined;

          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price, quantity: 1 }],
            ...(customerId
              ? { customer: customerId }
              : { customer_email: user.email ?? undefined }),
            client_reference_id: user.id,
            metadata: {
              user_id: user.id,
              plan_type: planType,
            },
            subscription_data: {
              metadata: {
                user_id: user.id,
                plan_type: planType,
              },
            },
            success_url: `${SITE_URL}/app/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${SITE_URL}/app/assinatura`,
            allow_promotion_codes: true,
          });

          console.log("[Stripe] Checkout criado", {
            user_id: user.id,
            plan: planType,
            session_id: session.id,
          });

          return Response.json({ url: session.url });
        } catch (err) {
          console.error("[Stripe/create-checkout]", err);
          return Response.json(
            { error: "Erro interno. Tente novamente em instantes." },
            { status: 500 },
          );
        }
      },
    },
  },
});
