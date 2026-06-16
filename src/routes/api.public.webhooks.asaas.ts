import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =====================================================================
// Webhook Asaas — automação de assinaturas
// =====================================================================
// Eventos tratados:
//   PAYMENT_CONFIRMED / PAYMENT_RECEIVED  → ativar assinatura
//   PAYMENT_OVERDUE                       → status overdue
//   PAYMENT_DELETED / PAYMENT_REFUNDED    → refunded / cancelar
//   SUBSCRIPTION_DELETED                  → canceled
//   SUBSCRIPTION_INACTIVATED              → canceled
//   SUBSCRIPTION_CREATED / SUBSCRIPTION_UPDATED → atualiza dados
//
// Validação: header `asaas-access-token` deve bater com ASAAS_WEBHOOK_TOKEN.
// =====================================================================

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "asaas-access-token",
  "proxy-authorization",
]);

const ACTIVATE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);
const CANCEL_EVENTS = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);
const REFUND_EVENTS = new Set(["PAYMENT_REFUNDED", "PAYMENT_DELETED"]);
const SUBSCRIPTION_SYNC_EVENTS = new Set(["SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED"]);

type Json = Record<string, unknown>;

function pickString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "string" && val.trim() ? val.trim() : null;
}
function pickNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}
function stripDigits(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 11 ? d : null;
}
function addMonths(start: Date, n: number): Date {
  const d = new Date(start);
  d.setMonth(d.getMonth() + n);
  return d;
}

export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
        const received = (
          request.headers.get("asaas-access-token") ??
          request.headers.get("access_token") ??
          ""
        ).trim();

        const safeHeaders = Object.fromEntries(
          [...request.headers.entries()].filter(([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase())),
        );

        const bodyText = await request.text().catch(() => "");
        let payload: Json = {};
        try { payload = bodyText ? (JSON.parse(bodyText) as Json) : {}; }
        catch { payload = { _raw: bodyText }; }

        const authorized = !!expected && received === expected;
        if (!authorized) {
          await supabaseAdmin.from("billing_events").insert([{
            provider: "asaas",
            event_type: "auth_failed",
            status: "error",
            error_message: "Token inválido",
            source_ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
            headers: safeHeaders,
            payload,
          }]);
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const eventType = pickString(payload, "event") ?? "unknown";
        const payment = (payload.payment ?? {}) as Json;
        const subscriptionRaw = (payload.subscription ?? {}) as Json;

        const paymentId = pickString(payment, "id");
        const subscriptionId =
          pickString(payment, "subscription") ?? pickString(subscriptionRaw, "id");
        const customerId =
          pickString(payment, "customer") ?? pickString(subscriptionRaw, "customer");
        const externalReference =
          pickString(payment, "externalReference") ?? pickString(subscriptionRaw, "externalReference");
        const value = pickNumber(payment, "value") ?? pickNumber(subscriptionRaw, "value");
        const billingType =
          pickString(payment, "billingType") ?? pickString(subscriptionRaw, "billingType");
        const nextDueDate =
          pickString(subscriptionRaw, "nextDueDate") ?? pickString(payment, "dueDate");
        const cycle = pickString(subscriptionRaw, "cycle");
        const status = pickString(subscriptionRaw, "status") ?? pickString(payment, "status");

        // Registro de auditoria
        const { data: billingRow, error: billingErr } = await supabaseAdmin
          .from("billing_events")
          .insert([{
            provider: "asaas",
            event_id: pickString(payload, "id") ?? paymentId ?? subscriptionId,
            event_type: eventType,
            status: "received",
            external_id: subscriptionId ?? paymentId,
            source_ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
            headers: safeHeaders,
            payload,
          }])
          .select("id")
          .single();

        if (billingErr) {
          console.error("[Asaas] billing_event:", billingErr);
          return Response.json({ ok: false }, { status: 500 });
        }
        const billingEventId = billingRow?.id ?? null;

        try {
          // Resolver user_id por externalReference, depois por asaas_subscriptions
          let userId: string | null = null;
          if (externalReference && /^[0-9a-f-]{36}$/i.test(externalReference)) {
            userId = externalReference;
          }
          if (!userId && subscriptionId) {
            const { data: sub } = await supabaseAdmin
              .from("asaas_subscriptions")
              .select("user_id")
              .eq("subscription_id", subscriptionId)
              .maybeSingle();
            userId = sub?.user_id ?? null;
          }
          if (!userId && customerId) {
            const { data: sub } = await supabaseAdmin
              .from("asaas_subscriptions")
              .select("user_id")
              .eq("customer_id", customerId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            userId = sub?.user_id ?? null;
          }

          // Upsert asaas_subscriptions (histórico)
          if (subscriptionId) {
            // Deriva plan_type do cycle se conhecido
            const planType = cycle === "YEARLY" ? "anual" : cycle === "MONTHLY" ? "mensal" : null;
            const upsertBody = {
              user_id: userId,
              customer_id: customerId,
              subscription_id: subscriptionId,
              payment_id: paymentId,
              plan_type: planType,
              value: value ?? undefined,
              status: status ?? undefined,
              billing_type: billingType ?? undefined,
              next_due_date: nextDueDate ?? undefined,
              cycle: cycle ?? undefined,
              raw_payload: payload as unknown as Record<string, unknown>,
            };
            await supabaseAdmin
              .from("asaas_subscriptions")
              .upsert(upsertBody as never, { onConflict: "subscription_id" });
          }

          // Não atualiza admin
          let isAdmin = false;
          if (userId) {
            const { data: adminRow } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId)
              .eq("role", "admin")
              .maybeSingle();
            isAdmin = !!adminRow;
          }

          if (userId && !isAdmin) {
            if (ACTIVATE_EVENTS.has(eventType)) {
              const planType = cycle === "YEARLY" ? "anual" : "mensal";
              const start = new Date();
              const end = addMonths(start, planType === "anual" ? 12 : 1);
              await supabaseAdmin
                .from("profiles")
                .update({
                  subscription_status: "active",
                  subscription_provider: "asaas",
                  subscription_identifier: subscriptionId,
                  subscription_start_date: start.toISOString(),
                  subscription_end_date: end.toISOString(),
                  plano_nome: planType === "anual" ? "Plano Anual" : "Plano Mensal",
                  plan_type: planType,
                  status: "aprovado",
                } as never)
                .eq("id", userId);
            } else if (OVERDUE_EVENTS.has(eventType)) {
              await supabaseAdmin
                .from("profiles")
                .update({ subscription_status: "overdue" } as never)
                .eq("id", userId);
            } else if (CANCEL_EVENTS.has(eventType)) {
              await supabaseAdmin
                .from("profiles")
                .update({ subscription_status: "canceled" } as never)
                .eq("id", userId);
            } else if (REFUND_EVENTS.has(eventType)) {
              await supabaseAdmin
                .from("profiles")
                .update({ subscription_status: "refunded" } as never)
                .eq("id", userId);
            } else if (SUBSCRIPTION_SYNC_EVENTS.has(eventType)) {
              // Apenas mantém subscription_identifier e plano_nome alinhados, sem mudar status.
              const planType = cycle === "YEARLY" ? "anual" : cycle === "MONTHLY" ? "mensal" : null;
              const patch: Record<string, unknown> = {
                subscription_provider: "asaas",
                subscription_identifier: subscriptionId,
              };
              if (planType) {
                patch.plan_type = planType;
                patch.plano_nome = planType === "anual" ? "Plano Anual" : "Plano Mensal";
              }
              await supabaseAdmin.from("profiles").update(patch as never).eq("id", userId);
            }
          }

          if (billingEventId) {
            await supabaseAdmin
              .from("billing_events")
              .update({
                status: "processed",
                processed_at: new Date().toISOString(),
                user_id: userId,
              })
              .eq("id", billingEventId);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Asaas] processing:", msg);
          if (billingEventId) {
            await supabaseAdmin
              .from("billing_events")
              .update({ status: "error", error_message: msg })
              .eq("id", billingEventId);
          }
        }

        // Sempre responder 200 após auditar — Asaas reenvia em erro 4xx/5xx
        return Response.json({ ok: true, received: true });
      },
    },
  },
});

// Helpers exportados para compor o stripDigits, evita warning de unused.
void stripDigits;
