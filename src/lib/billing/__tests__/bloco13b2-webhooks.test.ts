import { describe, it, expect } from "vitest";
import {
  chavesStripe,
  chavesAsaas,
  chavesNexano,
  claimBillingEvent,
  type ClaimArgs,
  type DecisaoEvento,
} from "../eventos";

// =====================================================================
// Simulador do RPC billing_claim_event (mesma semântica do SQL):
//   - UNIQUE (provider, dedupe_key) → duplicate
//   - fence por (provider, subject_key): timestamp < último aplicado → stale
// =====================================================================
function criarBanco() {
  const eventos = new Map<string, { id: string; status: string }>();
  const estado = new Map<string, string>(); // provider|subject → last_event_at ISO
  let seq = 0;
  const efeitos: string[] = [];

  const client = {
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const provider = a._provider as string;
      const dedupe = a._dedupe_key as string | null;
      const ts = a._event_timestamp as string | null;
      const subject = a._subject_key as string | null;

      if (dedupe) {
        const k = `${provider}|${dedupe}`;
        const existente = eventos.get(k);
        if (existente) {
          return { data: [{ event_row_id: existente.id, decision: "duplicate" }], error: null };
        }
        eventos.set(k, { id: `row-${++seq}`, status: "received" });
      } else {
        seq++;
      }
      const rowId = dedupe ? eventos.get(`${provider}|${dedupe}`)!.id : `row-${seq}`;

      if (subject && ts) {
        const k = `${provider}|${subject}`;
        const last = estado.get(k);
        if (last && new Date(ts).getTime() < new Date(last).getTime()) {
          return { data: [{ event_row_id: rowId, decision: "stale" }], error: null };
        }
        estado.set(k, ts);
      }
      return { data: [{ event_row_id: rowId, decision: "process" }], error: null };
    },
  };

  return { client, efeitos, estado };
}

async function entregar(
  banco: ReturnType<typeof criarBanco>,
  args: ClaimArgs,
  efeito: () => void,
): Promise<DecisaoEvento> {
  const r = await claimBillingEvent(banco.client, args);
  if (r.decision === "process") efeito();
  return r.decision;
}

// ---------------------------------------------------------------- fixtures
const stripeEvt = (id: string, created: number, type: string, sub = "sub_A") => ({
  id,
  type,
  created,
  data: { object: { object: "subscription", id: sub, customer: "cus_A" } },
});

const asaasEvt = (id: string, dateCreated: string, event: string, sub = "sub_asaas") => ({
  id,
  event,
  dateCreated,
  payment: { id: "pay_1", subscription: sub, customer: "cus_1" },
});

const nexanoEvt = (txId: string, createdAt: string, event: string, sub = "ods1xy5x7p8u57qp") => ({
  event,
  client: { email: "Fulano@Exemplo.com" },
  transaction: { id: "tx_x", identifier: txId, createdAt, payedAt: createdAt, status: "COMPLETED" },
  subscription: { identifier: sub, id: "s_ext", startAt: createdAt, status: "ACTIVE" },
});

// ---------------------------------------------------------------- extração
describe("13B.2 — extração de identidade e ordenação", () => {
  it("Stripe usa event.id e event.created", () => {
    const c = chavesStripe(stripeEvt("evt_1", 1700000000, "customer.subscription.updated"));
    expect(c.eventId).toBe("evt_1");
    expect(c.dedupeKey).toBe("evt_1");
    expect(c.eventTimestamp).toBe(new Date(1700000000000).toISOString());
    expect(c.subjectKey).toBe("sub_A");
  });

  it("Stripe sem created não é fenceado por ordem", () => {
    const c = chavesStripe({ id: "evt_x", type: "t", data: { object: {} } });
    expect(c.eventTimestamp).toBeNull();
  });

  it("Asaas usa payload.id e dateCreated normalizado para -03:00", () => {
    const c = chavesAsaas(asaasEvt("evt_a&1", "2026-08-20 04:07:25", "PAYMENT_OVERDUE"));
    expect(c.dedupeKey).toBe("evt_a&1");
    expect(c.eventTimestamp).toBe("2026-08-20T07:07:25.000Z");
    expect(c.subjectKey).toBe("sub_asaas");
  });

  it("Nexano deriva identidade estável e usa payedAt/createdAt", () => {
    const c = chavesNexano(nexanoEvt("eecgw50rpiiszma7", "2026-05-31T18:41:16.801Z", "TRANSACTION_PAID"));
    expect(c.dedupeKey).toBe("TRANSACTION_PAID:eecgw50rpiiszma7");
    expect(c.eventTimestamp).toBe("2026-05-31T18:41:16.801Z");
    expect(c.subjectKey).toBe("ods1xy5x7p8u57qp");
  });

  it("Nexano sem transação/assinatura não gera dedupe nem timestamp", () => {
    const c = chavesNexano({ event: "PING" });
    expect(c.dedupeKey).toBeNull();
    expect(c.eventTimestamp).toBeNull();
  });

  it("Nexano usa e-mail em minúsculas como assunto de fallback", () => {
    const c = chavesNexano({ event: "X", client: { email: "A@B.com" }, transaction: { id: "t1" } });
    expect(c.subjectKey).toBe("a@b.com");
  });
});

// ---------------------------------------------------------------- por provedor
const provedores = [
  {
    nome: "stripe" as const,
    novo: () => chavesStripe(stripeEvt("evt_new", 2000, "customer.subscription.deleted")),
    antigo: () => chavesStripe(stripeEvt("evt_old", 1000, "customer.subscription.created")),
  },
  {
    nome: "asaas" as const,
    novo: () => chavesAsaas(asaasEvt("evt_new", "2026-08-20 11:00:00", "SUBSCRIPTION_DELETED")),
    antigo: () => chavesAsaas(asaasEvt("evt_old", "2026-08-20 10:00:00", "PAYMENT_CONFIRMED")),
  },
  {
    nome: "nexano" as const,
    novo: () => chavesNexano(nexanoEvt("tx_new", "2026-05-31T11:00:00.000Z", "SUBSCRIPTION_CANCELED")),
    antigo: () => chavesNexano(nexanoEvt("tx_old", "2026-05-31T10:00:00.000Z", "TRANSACTION_PAID")),
  },
];

for (const p of provedores) {
  describe(`13B.2 — ${p.nome}`, () => {
    it("A. evento único normal é processado", async () => {
      const b = criarBanco();
      const d = await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("x"));
      expect(d).toBe("process");
      expect(b.efeitos).toHaveLength(1);
    });

    it("B. mesmo evento 2 vezes → um único efeito", async () => {
      const b = criarBanco();
      for (let i = 0; i < 2; i++) {
        await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("x"));
      }
      expect(b.efeitos).toHaveLength(1);
    });

    it("C. mesmo evento 10 vezes → um único efeito", async () => {
      const b = criarBanco();
      const decisoes: DecisaoEvento[] = [];
      for (let i = 0; i < 10; i++) {
        decisoes.push(await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("x")));
      }
      expect(b.efeitos).toHaveLength(1);
      expect(decisoes.filter((d) => d === "duplicate")).toHaveLength(9);
    });

    it("D. evento novo → evento antigo: antigo é ignorado como stale", async () => {
      const b = criarBanco();
      await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("novo"));
      const d = await entregar(b, { ...p.antigo(), provider: p.nome }, () => b.efeitos.push("antigo"));
      expect(d).toBe("stale");
      expect(b.efeitos).toEqual(["novo"]);
    });

    it("E. evento antigo → evento novo: ambos processados, estado final é o novo", async () => {
      const b = criarBanco();
      await entregar(b, { ...p.antigo(), provider: p.nome }, () => b.efeitos.push("antigo"));
      const d = await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("novo"));
      expect(d).toBe("process");
      expect(b.efeitos).toEqual(["antigo", "novo"]);
    });

    it("F/G. CANCELLED novo + ACTIVE antigo → cancelamento preservado", async () => {
      const b = criarBanco();
      await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("cancelado"));
      await entregar(b, { ...p.antigo(), provider: p.nome }, () => b.efeitos.push("ativado"));
      expect(b.efeitos).toEqual(["cancelado"]);
    });

    it("H. duas requests simultâneas com mesmo event_id → um efeito", async () => {
      const b = criarBanco();
      const args = { ...p.novo(), provider: p.nome };
      const [d1, d2] = await Promise.all([
        entregar(b, args, () => b.efeitos.push("x")),
        entregar(b, args, () => b.efeitos.push("x")),
      ]);
      expect(b.efeitos).toHaveLength(1);
      expect([d1, d2].sort()).toEqual(["duplicate", "process"]);
    });

    it("I. falha antes de qualquer escrita não altera estado", async () => {
      const b = criarBanco();
      const quebrado = {
        rpc: async () => ({ data: null, error: { message: "conexao" } }),
      };
      await expect(claimBillingEvent(quebrado, { ...p.novo(), provider: p.nome })).rejects.toThrow();
      expect(b.efeitos).toHaveLength(0);
    });

    it("J. retry após processamento concluído é idempotente", async () => {
      const b = criarBanco();
      await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("x"));
      const d = await entregar(b, { ...p.novo(), provider: p.nome }, () => b.efeitos.push("x"));
      expect(d).toBe("duplicate");
      expect(b.efeitos).toHaveLength(1);
    });
  });
}

// ---------------------------------------------------------------- Nexano extra
describe("13B.2 — Nexano: criação de conta", () => {
  const ativacao = () =>
    chavesNexano(nexanoEvt("tx_ativa", "2026-05-31T10:00:00.000Z", "TRANSACTION_PAID"));

  it("ativação duplicada → apenas uma conta", async () => {
    const b = criarBanco();
    let contas = 0;
    await entregar(b, { ...ativacao(), provider: "nexano" }, () => contas++);
    await entregar(b, { ...ativacao(), provider: "nexano" }, () => contas++);
    expect(contas).toBe(1);
  });

  it("10 retries → apenas uma conta", async () => {
    const b = criarBanco();
    let contas = 0;
    for (let i = 0; i < 10; i++) {
      await entregar(b, { ...ativacao(), provider: "nexano" }, () => contas++);
    }
    expect(contas).toBe(1);
  });

  it("ativação antiga após cancelamento mais novo não reativa", async () => {
    const b = criarBanco();
    const estados: string[] = [];
    await entregar(
      b,
      { ...chavesNexano(nexanoEvt("tx_c", "2026-05-31T11:00:00.000Z", "SUBSCRIPTION_CANCELED")), provider: "nexano" },
      () => estados.push("canceled"),
    );
    await entregar(b, { ...ativacao(), provider: "nexano" }, () => estados.push("active"));
    expect(estados).toEqual(["canceled"]);
  });

  it("assinaturas diferentes não interferem entre si", async () => {
    const b = criarBanco();
    const efeitos: string[] = [];
    await entregar(
      b,
      { ...chavesNexano(nexanoEvt("tx_1", "2026-05-31T11:00:00.000Z", "TRANSACTION_PAID", "sub_1")), provider: "nexano" },
      () => efeitos.push("s1"),
    );
    await entregar(
      b,
      { ...chavesNexano(nexanoEvt("tx_2", "2026-05-31T10:00:00.000Z", "TRANSACTION_PAID", "sub_2")), provider: "nexano" },
      () => efeitos.push("s2"),
    );
    expect(efeitos).toEqual(["s1", "s2"]);
  });
});

// =====================================================================
// 13B.2 — Regressão da concorrência real (billing_events_provider_event_id_key)
// ---------------------------------------------------------------------
// Simulador fiel às DUAS unique existentes na tabela:
//   - (provider, dedupe_key) WHERE dedupe_key IS NOT NULL
//   - (provider, event_id)   WHERE event_id   IS NOT NULL
// Semântica escolhida (igual à RPC corrigida): colisão em QUALQUER uma
// das duas travas de identidade é tratada como duplicate idempotente;
// linha em status 'error' é retomada de forma exclusiva (retry legítimo).
// =====================================================================
function criarBancoDuasUniques() {
  interface Linha { id: string; provider: string; eventId: string | null; dedupeKey: string | null; status: string }
  const linhas: Linha[] = [];
  let seq = 0;

  const client = {
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const provider = a._provider as string;
      const dedupe = (a._dedupe_key as string | null) ?? null;
      const eventId = (a._event_id as string | null) ?? null;

      const existente =
        (dedupe ? linhas.find((l) => l.provider === provider && l.dedupeKey === dedupe) : undefined) ??
        (eventId ? linhas.find((l) => l.provider === provider && l.eventId === eventId) : undefined);

      if (existente) {
        if (existente.status === "error") {
          existente.status = "received"; // retomada exclusiva
          return { data: [{ event_row_id: existente.id, decision: "process" }], error: null };
        }
        return { data: [{ event_row_id: existente.id, decision: "duplicate" }], error: null };
      }

      const nova: Linha = { id: `row-${++seq}`, provider, eventId, dedupeKey: dedupe, status: "received" };
      linhas.push(nova);
      return { data: [{ event_row_id: nova.id, decision: "process" }], error: null };
    },
  };

  return { client, linhas, marcarErro: (id: string) => { const l = linhas.find((x) => x.id === id); if (l) l.status = "error"; } };
}

describe("13B.2 — concorrência com as duas unique constraints", () => {
  const evento = (eid: string, dk = eid) => ({
    provider: "stripe" as const,
    eventType: "customer.subscription.updated",
    eventId: eid,
    dedupeKey: dk,
    eventTimestamp: "2026-01-10T12:00:00.000Z",
    subjectKey: "sub_ficticio",
  });

  for (const n of [2, 5, 10]) {
    it(`${n} chamadas simultâneas do mesmo evento → 1 process, ${n - 1} duplicate, 1 linha`, async () => {
      const b = criarBancoDuasUniques();
      let efeitos = 0;
      const decisoes = await Promise.all(
        Array.from({ length: n }, async () => {
          const r = await claimBillingEvent(b.client, evento("evt_conc"));
          if (r.decision === "process") efeitos++;
          return r.decision;
        }),
      );
      expect(decisoes.filter((d) => d === "process")).toHaveLength(1);
      expect(decisoes.filter((d) => d === "duplicate")).toHaveLength(n - 1);
      expect(efeitos).toBe(1);
      expect(b.linhas).toHaveLength(1);
    });
  }

  it("mesmo event_id com dedupe_key diferente → duplicate, nunca 2 linhas", async () => {
    const b = criarBancoDuasUniques();
    const a1 = await claimBillingEvent(b.client, evento("evt_x", "dk-a"));
    const a2 = await claimBillingEvent(b.client, evento("evt_x", "dk-b"));
    expect(a1.decision).toBe("process");
    expect(a2.decision).toBe("duplicate");
    expect(b.linhas).toHaveLength(1);
  });

  it("falha + retry: evento em erro é reprocessado uma única vez e depois volta a duplicate", async () => {
    const b = criarBancoDuasUniques();
    const r1 = await claimBillingEvent(b.client, evento("evt_retry"));
    expect(r1.decision).toBe("process");
    b.marcarErro(r1.eventRowId!);
    const r2 = await claimBillingEvent(b.client, evento("evt_retry"));
    expect(r2.decision).toBe("process");
    const r3 = await claimBillingEvent(b.client, evento("evt_retry"));
    expect(r3.decision).toBe("duplicate");
    expect(b.linhas).toHaveLength(1);
  });
});
