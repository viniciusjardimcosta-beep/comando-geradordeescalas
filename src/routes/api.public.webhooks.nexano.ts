import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhooks/nexano")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NEXANO_WEBHOOK_SECRET;
        const providedToken =
          request.headers.get("x-webhook-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

        // Filtra headers sensíveis antes de persistir (nunca armazenar o segredo em billing_events).
        const SENSITIVE_HEADERS = new Set([
          "authorization",
          "x-webhook-secret",
          "cookie",
          "set-cookie",
          "proxy-authorization",
        ]);
        const safeHeaders = Object.fromEntries(
          [...request.headers.entries()].filter(
            ([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase())
          )
        );

        // --- Validação de token ---
        // --- Leitura do body ANTES da validação (auditoria + discovery) ---
        let bodyText = "";
        try {
          bodyText = await request.text();
        } catch {
          // ignore
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          payload = { _raw: bodyText };
        }

        // Aceita token via header OU dentro do body (token/secret/validation_token/webhook_token)
        const bodyToken =
          (typeof payload.token === "string" && payload.token) ||
          (typeof payload.secret === "string" && payload.secret) ||
          (typeof payload.validation_token === "string" && payload.validation_token) ||
          (typeof payload.webhook_token === "string" && payload.webhook_token) ||
          null;

        const headerTokenValid = !!secret && !!providedToken && providedToken === secret;
        const bodyTokenValid = !!secret && !!bodyToken && bodyToken === secret;

        if (!headerTokenValid && !bodyTokenValid) {
          // Registra tentativa inválida COM payload completo para descobrir como a Nexano autentica
          try {
            await supabaseAdmin.from("billing_events").insert([
              {
                provider: "nexano",
                event_type: "auth_failed",
                status: "error",
                error_message: "Token inválido ou ausente",
                source_ip: request.headers.get("x-forwarded-for") ?? null,
                headers: safeHeaders,
                payload: payload,
              },
            ]);
          } catch {
            // ignore
          }

          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const eventId =
          typeof payload.event_id === "string" ? payload.event_id : null;
        const eventType =
          typeof payload.event === "string"
            ? payload.event
            : typeof payload.type === "string"
              ? payload.type
              : "unknown";
        const externalId =
          typeof payload.external_id === "string"
            ? payload.external_id
            : null;
        const customerEmail =
          typeof payload.customer_email === "string"
            ? payload.customer_email
            : null;

        // --- Registro de auditoria ---
        let insertError: Error | null = null;
        try {
          const { error } = await supabaseAdmin
            .from("billing_events")
            .insert([
              {
                provider: "nexano",
                event_id: eventId,
                event_type: eventType,
                status: "received",
                external_id: externalId,
                customer_email: customerEmail,
                source_ip: request.headers.get("x-forwarded-for") ?? null,
                headers: safeHeaders,
                payload: payload,
              },
            ]);
          if (error) insertError = new Error(error.message);
        } catch (err) {
          insertError = err instanceof Error ? err : new Error(String(err));
        }

        if (insertError) {
          console.error(
            "[Nexano Webhook] Falha ao registrar evento:",
            insertError
          );
          return new Response(
            JSON.stringify({ ok: false, error: "Internal Server Error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // --- Log de depuração ---
        console.log("[Nexano Webhook] Evento recebido:", {
          eventId,
          eventType,
          externalId,
          customerEmail,
        });

        // --- Retorno 200 (processamento pendente até doc da Nexano) ---
        return new Response(
          JSON.stringify({ ok: true, received: true }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
