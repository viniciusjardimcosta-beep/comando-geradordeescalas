import { describe, it, expect } from "vitest";
import { sanitizarPayload, chaveSensivel, REDACTED } from "@/lib/billing/sanitizePayload";

// Payload fictício no formato do Asaas (nenhum dado operacional real).
const payloadAsaas = () => ({
  event: "PAYMENT_CONFIRMED",
  dateCreated: "2026-09-01 09:00:00",
  token: "tk-ficticio-123",
  Authorization: "Bearer abc.def.ghi",
  payment: {
    id: "pay_000111",
    customer: "cus_000222",
    subscription: "sub_000333",
    value: 29.9,
    status: "CONFIRMED",
    billingType: "PIX",
    dueDate: "2026-09-05",
    creditCard: { access_token: "at-ficticio", holderName: "Fulano de Tal" },
  },
  extras: [{ API_KEY: "ak-ficticio" }, { apiKey: "ak2-ficticio" }, { nota: "ok" }],
});

describe("Bloco 13B.4 — sanitização de payload de webhook", () => {
  it("A. token na raiz é redigido", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.token).toBe(REDACTED);
  });

  it("B. Authorization é redigido", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.Authorization).toBe(REDACTED);
  });

  it("C. access_token aninhado é redigido", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.payment.creditCard.access_token).toBe(REDACTED);
  });

  it("D. API_KEY/apiKey com variação de caixa são redigidos", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.extras[0].API_KEY).toBe(REDACTED);
    expect(s.extras[1].apiKey).toBe(REDACTED);
    expect(chaveSensivel("ApIkEy")).toBe(true);
    expect(chaveSensivel("customer")).toBe(false);
  });

  it("E. campos normais permanecem", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.payment.creditCard.holderName).toBe("Fulano de Tal");
    expect(s.extras[2].nota).toBe("ok");
  });

  it("F. ids, status, valores e timestamps permanecem", () => {
    const s = sanitizarPayload(payloadAsaas());
    expect(s.event).toBe("PAYMENT_CONFIRMED");
    expect(s.dateCreated).toBe("2026-09-01 09:00:00");
    expect(s.payment.id).toBe("pay_000111");
    expect(s.payment.customer).toBe("cus_000222");
    expect(s.payment.subscription).toBe("sub_000333");
    expect(s.payment.value).toBe(29.9);
    expect(s.payment.status).toBe("CONFIRMED");
    expect(s.payment.dueDate).toBe("2026-09-05");
  });

  it("G. nenhum valor secreto aparece no JSON persistido", () => {
    const json = JSON.stringify(sanitizarPayload(payloadAsaas()));
    for (const segredo of [
      "tk-ficticio-123",
      "Bearer abc.def.ghi",
      "at-ficticio",
      "ak-ficticio",
      "ak2-ficticio",
    ]) {
      expect(json).not.toContain(segredo);
    }
  });

  it("H. o objeto original não é modificado", () => {
    const original = payloadAsaas();
    const copia = JSON.parse(JSON.stringify(original));
    sanitizarPayload(original);
    expect(original).toEqual(copia);
  });

  it("mantém compatibilidade com as chaves já redigidas no Nexano", () => {
    const s = sanitizarPayload({
      secret: "x",
      webhook_token: "x",
      validation_token: "x",
      authentication_token: "x",
      webhookSecret: "x",
      subscription: { identifier: "sub_ficticio", status: "ACTIVE" },
    });
    expect(s.secret).toBe(REDACTED);
    expect(s.webhook_token).toBe(REDACTED);
    expect(s.validation_token).toBe(REDACTED);
    expect(s.authentication_token).toBe(REDACTED);
    expect(s.webhookSecret).toBe(REDACTED);
    expect(s.subscription).toEqual({ identifier: "sub_ficticio", status: "ACTIVE" });
  });
});
