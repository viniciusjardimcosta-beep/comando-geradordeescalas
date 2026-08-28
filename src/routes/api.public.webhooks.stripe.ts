import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe.server";

// POST /api/public/webhooks/stripe
// Stripe envia o evento com header stripe-signature.

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature") ?? "";
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
          console.error("[Stripe] STRIPE_WEBHOOK_SECRET ausente");
          return Response.json({ error: "Erro interno." }, { status: 500 });
        }

        const rawBody = await request.text();
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            webhookSecret,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Stripe] Assinatura inválida:", msg);
          return Response.json({ error: "Webhook inválido." }, { status: 400 });
        }

        console.log("[Stripe] Webhook recebido", { type: event.type, id: event.id });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Claim atômico: auditoria + idempotência + ordenação (event.id / event.created)
        const chaves = chavesStripe(event as unknown as { id: string; type: string; created: number; data: { object: unknown } });
        let claim;
        try {
          claim = await claimBillingEvent(supabaseAdmin as never, {
            ...chaves,
            provider: "stripe",
            externalId: chaves.subjectKey,
            headers: {},
            payload: { id: event.id, type: event.type, created: event.created },
          });
        } catch (err) {
          console.error("[Stripe] Falha ao registrar evento:", err instanceof Error ? err.message : String(err));
          return Response.json({ error: "Erro interno." }, { status: 500 });
        }

        if (claim.decision === "duplicate") {
          console.log("[Stripe] Evento duplicado ignorado", { id: event.id, type: event.type });
          return Response.json({ received: true, ignored: "duplicate" });
        }
        if (claim.decision === "stale") {
          console.log("[Stripe] Evento fora de ordem ignorado", { id: event.id, type: event.type });
          return Response.json({ received: true, ignored: "stale" });
        }


        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId =
                (session.metadata?.user_id as string | undefined) ??
                session.client_reference_id ??
                null;
              const planType = (session.metadata?.plan_type as string | undefined) ?? null;
              if (!userId) {
                console.warn("[Stripe] checkout.session.completed sem user_id");
                break;
              }
              const subscriptionId =
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id ?? null;
              const customerId =
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null;

              await supabaseAdmin.from("stripe_subscriptions").upsert(
                {
                  user_id: userId,
                  customer_id: customerId,
                  subscription_id: subscriptionId,
                  plan_type: planType,
                  status: "active",
                  raw_payload: session as unknown as Record<string, unknown>,
                } as never,
                { onConflict: "subscription_id" },
              );
              break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = (sub.metadata?.user_id as string | undefined) ?? null;
              const planType = (sub.metadata?.plan_type as string | undefined) ?? null;
              const priceId = sub.items.data[0]?.price?.id ?? null;
              const customerId =
                typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

              let status = sub.status as string;
              if (event.type === "customer.subscription.deleted") status = "canceled";

              const periodEnd = (sub as unknown as { current_period_end?: number })
                .current_period_end;

              const payload: Record<string, unknown> = {
                subscription_id: sub.id,
                customer_id: customerId,
                price_id: priceId,
                plan_type: planType,
                status,
                cancel_at_period_end: sub.cancel_at_period_end,
                current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
                raw_payload: sub as unknown as Record<string, unknown>,
              };
              if (userId) payload.user_id = userId;

              const { error: upsertErr } = await supabaseAdmin
                .from("stripe_subscriptions")
                .upsert(payload as never, { onConflict: "subscription_id" });
              if (upsertErr) {
                console.error("[Stripe] Falha upsert stripe_subscriptions", {
                  subscription_id: sub.id,
                  customer_id: customerId,
                  user_id: userId,
                  error: upsertErr.message,
                });
              } else {
                console.log("[Stripe] Subscription sincronizada", {
                  event: event.type,
                  subscription_id: sub.id,
                  customer_id: customerId,
                  user_id: userId,
                  status,
                  plan_type: planType,
                });
              }

              // Reflete em profiles
              if (userId) {
                const profileStatus =
                  status === "active" || status === "trialing"
                    ? "active"
                    : status === "canceled"
                      ? "canceled"
                      : status === "past_due" || status === "unpaid"
                        ? "expired"
                        : status;

                await supabaseAdmin
                  .from("profiles")
                  .update({
                    subscription_status: profileStatus as never,
                    plan_type: (planType === "yearly" ? "anual" : "mensal") as never,
                    subscription_end_date: periodEnd
                      ? new Date(periodEnd * 1000).toISOString()
                      : null,
                  } as never)
                  .eq("id", userId);
              }

              if (event.type === "customer.subscription.deleted") {
                console.log("[Stripe] Assinatura cancelada", { subscription_id: sub.id });
              }
              break;
            }

            case "invoice.payment_succeeded": {
              const invoice = event.data.object as Stripe.Invoice;
              const subscriptionId =
                typeof (invoice as unknown as { subscription?: string | { id: string } })
                  .subscription === "string"
                  ? ((invoice as unknown as { subscription: string }).subscription)
                  : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ??
                    null;
              const customerId =
                typeof invoice.customer === "string"
                  ? invoice.customer
                  : invoice.customer?.id ?? null;

              // Atualiza status da assinatura para active e propaga em profiles
              if (subscriptionId) {
                await supabaseAdmin
                  .from("stripe_subscriptions")
                  .update({ status: "active" } as never)
                  .eq("subscription_id", subscriptionId);

                const { data: row } = await supabaseAdmin
                  .from("stripe_subscriptions")
                  .select("user_id, current_period_end")
                  .eq("subscription_id", subscriptionId)
                  .maybeSingle();
                const userId = (row as { user_id?: string } | null)?.user_id ?? null;
                if (userId) {
                  await supabaseAdmin
                    .from("profiles")
                    .update({
                      subscription_status: "active" as never,
                    } as never)
                    .eq("id", userId);
                  console.log("[Stripe] Assinatura ativada", {
                    user_id: userId,
                    subscription_id: subscriptionId,
                  });
                }
              } else if (customerId) {
                console.log("[Stripe] invoice.payment_succeeded sem subscription", {
                  customer: customerId,
                });
              }
              break;
            }

            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              const subscriptionId =
                typeof (invoice as unknown as { subscription?: string | { id: string } })
                  .subscription === "string"
                  ? ((invoice as unknown as { subscription: string }).subscription)
                  : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ??
                    null;
              if (subscriptionId) {
                await supabaseAdmin
                  .from("stripe_subscriptions")
                  .update({ status: "past_due" } as never)
                  .eq("subscription_id", subscriptionId);

                const { data: row } = await supabaseAdmin
                  .from("stripe_subscriptions")
                  .select("user_id")
                  .eq("subscription_id", subscriptionId)
                  .maybeSingle();
                const userId = (row as { user_id?: string } | null)?.user_id ?? null;
                if (userId) {
                  await supabaseAdmin
                    .from("profiles")
                    .update({ subscription_status: "expired" as never } as never)
                    .eq("id", userId);
                }
              }
              console.warn("[Stripe] Pagamento falhou", { subscription_id: subscriptionId });
              break;
            }

            default:
              // outros eventos ignorados
              break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Stripe] Erro processando evento", event.type, msg);
          return Response.json({ error: "Erro interno." }, { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
