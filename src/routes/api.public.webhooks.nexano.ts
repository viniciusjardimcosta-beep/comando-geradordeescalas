import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =====================================================================
// Webhook Nexano — automação completa de assinaturas
// =====================================================================
// Eventos tratados:
//   TRANSACTION_PAID         → cria/atualiza usuário + ativa/renova assinatura
//   SUBSCRIPTION_CANCELED    → cancela
//   SUBSCRIPTION_EXPIRED     → cancela
//   TRANSACTION_REFUNDED     → refunded (revoga acesso)
//   CHARGEBACK               → refunded (revoga acesso)
//
// Regras de segurança:
//   - Nunca sobrescreve usuário admin
//   - Nunca duplica usuário por email
//   - Conta criada automaticamente recebe password_temporary=true
// =====================================================================

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-webhook-secret",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

const ACTIVATION_EVENTS = new Set(["TRANSACTION_PAID"]);
const CANCEL_EVENTS = new Set(["SUBSCRIPTION_CANCELED", "SUBSCRIPTION_EXPIRED"]);
const REFUND_EVENTS = new Set(["TRANSACTION_REFUNDED", "CHARGEBACK"]);

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

function stripDigits(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 11 ? d : null;
}

function computeEndDate(startISO: string | null, count: number | null, type: string | null): string | null {
  const start = startISO ? new Date(startISO) : new Date();
  const n = count && count > 0 ? count : 1;
  const t = (type ?? "MONTHS").toUpperCase();
  const end = new Date(start);
  switch (t) {
    case "DAYS":   end.setDate(end.getDate() + n); break;
    case "WEEKS":  end.setDate(end.getDate() + n * 7); break;
    case "YEARS":  end.setFullYear(end.getFullYear() + n); break;
    case "MONTHS":
    default:       end.setMonth(end.getMonth() + n); break;
  }
  return end.toISOString();
}

export const Route = createFileRoute("/api/public/webhooks/nexano")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.NEXANO_WEBHOOK_SECRET ?? "").trim();

        const headerToken = (
          request.headers.get("x-webhook-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          ""
        ).trim();

        const safeHeaders = Object.fromEntries(
          [...request.headers.entries()].filter(([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase())),
        );

        const bodyText = await request.text().catch(() => "");
        let payload: Json = {};
        try { payload = bodyText ? (JSON.parse(bodyText) as Json) : {}; }
        catch { payload = { _raw: bodyText }; }

        const bodyToken = typeof payload.token === "string" ? payload.token.trim() : "";
        const authorized =
          !!secret && (headerToken === secret || bodyToken === secret);

        if (!authorized) {
          await supabaseAdmin.from("billing_events").insert([{
            provider: "nexano",
            event_type: "auth_failed",
            status: "error",
            error_message: "Token inválido",
            source_ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
            headers: safeHeaders,
            payload,
          }]);
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        // ----- Extração de campos -----
        const eventType = typeof payload.event === "string" ? payload.event : "unknown";
        const client = (payload.client ?? {}) as Json;
        const transaction = (payload.transaction ?? {}) as Json;
        const subscription = (payload.subscription ?? {}) as Json;
        const orderItems = Array.isArray(payload.orderItems) ? (payload.orderItems as Json[]) : [];
        const firstItem = orderItems[0] ?? {};
        const product = (firstItem.product ?? {}) as Json;

        const customerEmail = pickString(client, "email");
        const customerName = pickString(client, "name");
        const customerCpf = pickString(client, "cpf");
        const customerCnpj = pickString(client, "cnpj");
        const customerPhone = pickString(client, "phone");

        const subIdentifier = pickString(subscription, "identifier");
        const subExternalId = pickString(subscription, "id");
        const subStatusStr = pickString(subscription, "status");
        const subStartAt = pickString(subscription, "startAt");
        const intervalCount = pickNumber(subscription, "intervalCount");
        const intervalType = pickString(subscription, "intervalType");

        const txStatus = pickString(transaction, "status");
        const txId = pickString(transaction, "id");
        const txIdentifier = pickString(transaction, "identifier");

        const offerCode = pickString(payload, "offerCode");
        const productId = pickString(product, "id");
        const productExternalId = pickString(product, "externalId");
        const productName = pickString(product, "name");

        // ----- Registro de auditoria (billing_events) -----
        const { data: billingRow, error: billingErr } = await supabaseAdmin
          .from("billing_events")
          .insert([{
            provider: "nexano",
            event_id: pickString(payload, "event_id") ?? txId ?? subIdentifier,
            event_type: eventType,
            status: "received",
            external_id: subIdentifier,
            customer_email: customerEmail,
            source_ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
            headers: safeHeaders,
            payload,
          }])
          .select("id")
          .single();

        if (billingErr) {
          console.error("[Nexano] Falha ao gravar billing_event:", billingErr);
          return Response.json({ ok: false, error: "Persist failed" }, { status: 500 });
        }

        const billingEventId = billingRow?.id ?? null;

        // ----- Processamento por tipo de evento -----
        try {
          if (ACTIVATION_EVENTS.has(eventType) && txStatus === "COMPLETED") {
            await handleActivation({
              customerEmail, customerName, customerCpf, customerCnpj, customerPhone,
              subIdentifier, subExternalId, subStatusStr, subStartAt, intervalCount, intervalType,
              txId, txIdentifier, offerCode, productId, productExternalId, productName,
              eventType, billingEventId,
            });
          } else if (CANCEL_EVENTS.has(eventType)) {
            await handleStatusChange(subIdentifier, customerEmail, "canceled", eventType, billingEventId);
          } else if (REFUND_EVENTS.has(eventType)) {
            await handleStatusChange(subIdentifier, customerEmail, "refunded", eventType, billingEventId);
          }

          await supabaseAdmin
            .from("billing_events")
            .update({ status: "processed", processed_at: new Date().toISOString() })
            .eq("id", billingEventId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Nexano] Erro ao processar evento:", msg);
          await supabaseAdmin
            .from("billing_events")
            .update({ status: "error", error_message: msg })
            .eq("id", billingEventId);
          // Retorna 200 mesmo assim — evento foi recebido e auditado
        }

        return Response.json({ ok: true, received: true });
      },
    },
  },
});

// =====================================================================
// Handlers
// =====================================================================

interface ActivationArgs {
  customerEmail: string | null;
  customerName: string | null;
  customerCpf: string | null;
  customerCnpj: string | null;
  customerPhone: string | null;
  subIdentifier: string | null;
  subExternalId: string | null;
  subStatusStr: string | null;
  subStartAt: string | null;
  intervalCount: number | null;
  intervalType: string | null;
  txId: string | null;
  txIdentifier: string | null;
  offerCode: string | null;
  productId: string | null;
  productExternalId: string | null;
  productName: string | null;
  eventType: string;
  billingEventId: string | null;
}

async function handleActivation(a: ActivationArgs) {
  if (!a.customerEmail) throw new Error("Payload sem client.email");
  if (!a.subIdentifier) throw new Error("Payload sem subscription.identifier");

  const email = a.customerEmail.toLowerCase();

  // 1) Procurar usuário existente por email
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  let userId = existing?.id ?? null;

  // 2) Criar usuário se não existir
  if (!userId) {
    // Senha temporária criptograficamente aleatória (32 bytes → 64 hex chars).
    // Nunca derivada de CPF/CNPJ/e-mail; o usuário define a própria senha via /redefinir-senha.
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const tempPassword =
      "Nx!" +
      Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { nome: a.customerName ?? email },
    });
    if (createErr || !created.user) throw new Error(`createUser falhou: ${createErr?.message}`);
    userId = created.user.id;
  }

  // 3) Verificar que NÃO é admin antes de sobrescrever assinatura
  const { data: isAdminRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  const isAdmin = !!isAdminRow;

  const endDate = computeEndDate(a.subStartAt, a.intervalCount, a.intervalType);

  // Determinar plan_type a partir do offerCode (com fallback por product.name).
  // Enum permitido: 'trial' | 'mensal' | 'semestral' | 'anual'.
  // Nunca bloqueia a ativação — em último caso usa 'mensal' como default seguro.
  const resolvePlanType = (): "mensal" | "semestral" | "anual" => {
    const offer = (a.offerCode ?? "").trim().toUpperCase();
    if (offer === "KY8MOGZ") return "mensal";
    if (offer === "LBFYJPC") return "anual";
    const name = (a.productName ?? "").toLowerCase();
    if (name.includes("anual")) return "anual";
    if (name.includes("semestral")) return "semestral";
    if (name.includes("mensal")) return "mensal";
    return "mensal";
  };
  const planType = resolvePlanType();

  // 4) Atualizar perfil (não sobrescreve admin)
  if (!isAdmin) {
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "active",
        subscription_provider: "nexano",
        subscription_identifier: a.subIdentifier,
        subscription_start_date: a.subStartAt,
        subscription_end_date: endDate,
        plano_nome: a.productName,
        plan_type: planType,
        status: "aprovado",
        nome: a.customerName,
        cpf: stripDigits(a.customerCpf) ?? stripDigits(a.customerCnpj),
        telefone: a.customerPhone,
        password_temporary: !existing ? true : undefined,
      })
      .eq("id", userId);
    if (updErr) throw new Error(`update profile: ${updErr.message}`);
  }



  // 5) Upsert da assinatura (histórico)
  const { error: subErr } = await supabaseAdmin
    .from("nexano_subscriptions")
    .upsert({
      user_id: userId,
      customer_email: email,
      customer_name: a.customerName,
      customer_cpf: stripDigits(a.customerCpf) ?? stripDigits(a.customerCnpj),
      customer_phone: a.customerPhone,
      subscription_identifier: a.subIdentifier,
      subscription_external_id: a.subExternalId,
      subscription_status: a.subStatusStr ?? "ACTIVE",
      start_at: a.subStartAt,
      end_at: endDate,
      interval_count: a.intervalCount,
      interval_type: a.intervalType,
      offer_code: a.offerCode,
      product_id: a.productId,
      product_external_id: a.productExternalId,
      product_name: a.productName,
      last_transaction_id: a.txId,
      last_transaction_identifier: a.txIdentifier,
      last_event_type: a.eventType,
      last_billing_event_id: a.billingEventId,
    }, { onConflict: "subscription_identifier" });
  if (subErr) throw new Error(`upsert subscription: ${subErr.message}`);

  // 6) Vincular user_id no billing_event
  if (a.billingEventId) {
    await supabaseAdmin
      .from("billing_events")
      .update({ user_id: userId })
      .eq("id", a.billingEventId);
  }
}

async function handleStatusChange(
  subIdentifier: string | null,
  customerEmail: string | null,
  newStatus: "canceled" | "refunded",
  eventType: string,
  billingEventId: string | null,
) {
  if (!subIdentifier) {
    console.warn(`[Nexano] ${eventType} sem subscription.identifier — ignorado`);
    return;
  }

  // Localiza assinatura
  const { data: sub } = await supabaseAdmin
    .from("nexano_subscriptions")
    .select("user_id")
    .eq("subscription_identifier", subIdentifier)
    .maybeSingle();

  // Fallback: localizar por profiles.subscription_identifier
  let userId = sub?.user_id ?? null;
  if (!userId && customerEmail) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", customerEmail.toLowerCase())
      .maybeSingle();
    userId = p?.id ?? null;
  }

  // Atualiza histórico
  await supabaseAdmin
    .from("nexano_subscriptions")
    .update({
      subscription_status: newStatus.toUpperCase(),
      last_event_type: eventType,
      last_billing_event_id: billingEventId,
    })
    .eq("subscription_identifier", subIdentifier);

  if (!userId) return;

  // Atualiza perfil — exceto admin
  const { data: isAdminRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (isAdminRow) return;

  await supabaseAdmin
    .from("profiles")
    .update({ subscription_status: newStatus })
    .eq("id", userId);

  if (billingEventId) {
    await supabaseAdmin
      .from("billing_events")
      .update({ user_id: userId })
      .eq("id", billingEventId);
  }
}
