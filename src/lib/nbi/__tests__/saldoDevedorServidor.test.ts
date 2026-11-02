import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (h: unknown) => h }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const admin = vi.hoisted(() => ({ from: vi.fn(), storage: { from: vi.fn() } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
import { gerarNbi, reservarNumeroNbi } from "@/lib/nbi.functions";
const base = { SUBTIPO: "saldo_devedor", NATUREZA_SALDO: "DEBITO", QTD_HORAS: "75", MOTIVO: "motivo fictício", mes_referencia_sel: "2026-12" };
type Handler = (args: { data: Record<string, unknown>; context: Record<string, unknown> }) => Promise<{ ok: boolean; code?: string }>;
beforeEach(() => vi.clearAllMocks());
describe("Folga inválida não consome número em nenhum caminho", () => {
  for (const [nome, fn] of [["gerarNbi", gerarNbi], ["reservarNumeroNbi", reservarNumeroNbi]] as const) {
    it.each([{ QTD_HORAS: "75abc" }, { QTD_HORAS: "-75" }, { QTD_HORAS: "75,5" }, { QTD_HORAS: "0" }, { MOTIVO: "" }, { SUBTIPO: "realizada" }, { SUBTIPO: "desconhecido" }, { mes_referencia_sel: "2026-13" }])(`${nome} rejeita %j antes de RPC/storage/escrita`, async (patch) => {
      let contador = 52;
      const rpc = vi.fn(() => { contador++; });
      const assunto = { tipo: "folga_compensatoria", campos: { ...base, ...patch }, texto_final: "texto aparentemente válido" };
      const original = JSON.stringify(assunto);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: { assuntos: [assunto], data_documento: "2026-12-01" }, error: null });
      const supabase = { from: vi.fn(() => q), rpc };
      for (const data of [{}, { modo_numeracao: "manual", numero_manual: 53 }, { modo_numeracao: "manual", numero_manual: 53, reutilizar_numero_de: "ficticio" }]) {
        const result = await (fn as unknown as Handler)({ data: { documento_id: "00000000-0000-4000-8000-000000000001", ...data }, context: { supabase, userId: "ficticio" } });
        expect(result.ok).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
        expect(admin.from).not.toHaveBeenCalled();
        expect(admin.storage.from).not.toHaveBeenCalled();
        expect(contador).toBe(52);
        expect(JSON.stringify(assunto)).toBe(original);
      }
    });
  }
});