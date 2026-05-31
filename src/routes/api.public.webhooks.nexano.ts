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

        // --- Validação de token ---
        if (!secret || !providedToken || providedToken !== secret) {
          // Registra tentativa inválida (silencioso — não falha a resposta 401)
          try {
            await supabaseAdmin.from("billing_events").insert([
              {
                provider: "nexano",
                event_type: "auth_failed",
                status: "error",
                error_message: "Token inválido ou ausente",
                source_ip: request.headers.get("x-forwarded-for") ?? null,
                headers: Object.fromEntries(request.headers.entries()),
                payload: {},
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

        // --- Leitura do body ---
        let bodyText: string;
        try {
          bodyText = await request.text();
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Bad Request" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(bodyText);
        } catch {
          // Payload não é JSON válido — registra como texto bruto
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
                headers: Object.fromEntries(request.headers.entries()),
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
