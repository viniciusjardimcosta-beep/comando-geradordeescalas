import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/stripe-audit")({
  server: {
    handlers: {
      GET: async () => {
        const sk = process.env.STRIPE_SECRET_KEY ?? "";
        const monthly = process.env.STRIPE_MONTHLY_PRICE_ID ?? "";
        const yearly = process.env.STRIPE_YEARLY_PRICE_ID ?? "";
        const stripe = getStripe();
        const tail = (s: string) => s.slice(-6);
        const result: Record<string, unknown> = {
          mode: sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : "unknown",
          sk_tail: tail(sk),
          monthly_id: monthly,
          yearly_id: yearly,
        };
        try {
          const p = await stripe.prices.retrieve(monthly);
          result.monthly = { ok: true, active: p.active, currency: p.currency, unit_amount: p.unit_amount, recurring: p.recurring, livemode: p.livemode };
        } catch (e) {
          result.monthly = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
        try {
          const p = await stripe.prices.retrieve(yearly);
          result.yearly = { ok: true, active: p.active, currency: p.currency, unit_amount: p.unit_amount, recurring: p.recurring, livemode: p.livemode };
        } catch (e) {
          result.yearly = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
        return Response.json(result);
      },
    },
  },
});
