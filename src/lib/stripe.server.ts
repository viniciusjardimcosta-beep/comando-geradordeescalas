// Server-only Stripe client. Never import from client code.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurado");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return _stripe;
}

export const STRIPE_PRICE_MONTHLY =
  process.env.STRIPE_MONTHLY_PRICE_ID || "price_1TjUWrEuMln6iAwSeeM9w1uS";
export const STRIPE_PRICE_YEARLY =
  process.env.STRIPE_YEARLY_PRICE_ID || "price_1TjUXmEuMln6iAwSJECSJSja";

export function priceIdForPlan(plan: "monthly" | "yearly"): string {
  return plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
}
