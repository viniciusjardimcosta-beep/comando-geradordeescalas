import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhooks/nexano")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.NEXANO_WEBHOOK_SECRET ?? "").trim();
        const providedToken = (
          request.headers.get("x-webhook-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          ""
        ).trim();

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

        // Aceita token via header OU dentro do body da Nexano.
        const tokenCandidates = [
          payload.token,
          payload.secret,
          payload.validation_token,
          payload.webhook_token,
          payload.webhookSecret,
          payload.webhook_secret,
          payload.authentication_token,
        ];
        const bodyToken = tokenCandidates
          .find((value): value is string => typeof value === "string" && value.trim().length > 0)
          ?.trim() ?? "";

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
                error_message: `Token inválido. secret_len=${secret.length} body_token_len=${bodyToken.length} header_token_len=${providedToken.length} has_body_token=${!!bodyToken} match_body=${bodyToken === secret} match_header=${providedToken === secret}`,
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
