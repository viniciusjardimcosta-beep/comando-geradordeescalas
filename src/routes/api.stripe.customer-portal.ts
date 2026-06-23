import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe.server";

// POST /api/stripe/customer-portal
// Header: Authorization: Bearer <supabase access token>
// Retorna: { url }

const RETURN_URL = "https://comandogeradordeescalas.com.br/app/assinatura";

export const Route = createFileRoute("/api/stripe/customer-portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) {
            return Response.json({ error: "Não autenticado" }, { status: 401 });
          }

          const supabaseAuth = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${token}` } },
            },
          );

          const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser(token);
          if (userErr || !userRes?.user) {
            return Response.json({ error: "Sessão inválida" }, { status: 401 });
          }
          const user = userRes.user;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: row } = await supabaseAdmin
            .from("stripe_subscriptions")
            .select("customer_id")
            .eq("user_id", user.id)
            .not("customer_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const customerId = (row as { customer_id?: string } | null)?.customer_id;
          if (!customerId) {
            return Response.json(
              { error: "Nenhuma assinatura Stripe encontrada para este usuário." },
              { status: 404 },
            );
          }

          const stripe = getStripe();
          const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: RETURN_URL,
          });

          console.log("[Stripe] Portal criado", {
            user_id: user.id,
            customer_id: customerId,
            session_id: session.id,
          });

          return Response.json({ url: session.url });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Stripe] Portal erro", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
