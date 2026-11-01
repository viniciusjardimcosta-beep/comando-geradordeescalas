import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (h: unknown) => h };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const admin = vi.hoisted(() => ({ from: vi.fn(() => ({ insert: vi.fn() })), storage: { from: vi.fn() } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
import { gerarNbi, reservarNumeroNbi } from "@/lib/nbi.functions";

const id = "00000000-0000-4000-8000-000000000001";
const cadastro = { id, nome: "TESTE VICTOR DE HOMOLOGACAO", posto_graduacao: "Soldado", quadro: "QPBM", tipo_vinculo: "TEMPORARIO", nome_guerra: null as string | null };
type Handler = (input: { data: Record<string, unknown>; context: Record<string, unknown> }) => Promise<{ ok: boolean; code?: string }>;
const chamar = (fn: unknown, supabase: unknown) => (fn as Handler)({ data: { documento_id: id, ano_local: 2026 }, context: { supabase, userId: "usuario-ficticio" } });

function cliente(assuntos: unknown[], militar = cadastro) {
  let ultimaNota = 52;
  const rpc = vi.fn(async () => { ultimaNota += 1; return { data: [{ numero: ultimaNota, ano: 2026, reservado: true }], error: null }; });
  const from = vi.fn((tabela: string) => {
    const retorno = tabela === "militares" ? { data: [militar], error: null }
      : { data: { assuntos, canceled_at: null, data_documento: "2026-11-01" }, error: null };
    const q: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in"]) q[metodo] = () => q;
    q.maybeSingle = async () => retorno;
    q.then = (resolver: (v: unknown) => void) => Promise.resolve(retorno).then(resolver);
    return q;
  });
  return { supabase: { from, rpc }, contador: () => ultimaNota };
}

beforeEach(() => vi.clearAllMocks());
describe("Proteção dos handlers reais antes da numeração", () => {
  it.each([null, "", "   "])("gerarNbi rejeita nome_guerra %s sem reservar, escrever ou acessar storage", async (nome_guerra) => {
    const c = cliente([{ militar_id: id, texto_final: "Texto frontend aparentemente válido" }], { ...cadastro, nome_guerra });
    const r = await chamar(gerarNbi, c.supabase);
    expect(r).toEqual({ ok: false, code: "Informe o nome de guerra do Soldado Temporário antes de gerar a NBI." });
    expect(c.supabase.rpc).not.toHaveBeenCalled();
    expect(c.contador()).toBe(52);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.storage.from).not.toHaveBeenCalled();
  });
  it.each([null, "", "   "])("reservarNumeroNbi rejeita diretamente nome_guerra %s sem consumir número", async (nome_guerra) => {
    const c = cliente([{ militar_id: id }], { ...cadastro, nome_guerra });
    expect((await chamar(reservarNumeroNbi, c.supabase)).ok).toBe(false);
    expect(c.supabase.rpc).not.toHaveBeenCalled();
    expect(c.contador()).toBe(52);
  });
  it.each(["militar_titular_id", "comissao"])("protege referência estruturada %s nos dois caminhos", async (campo) => {
    const assunto = campo === "comissao" ? { comissao: [{ tipo: "militar", militar_id: id }] } : { [campo]: id };
    for (const fn of [gerarNbi, reservarNumeroNbi]) {
      const c = cliente([assunto]);
      expect((await chamar(fn, c.supabase)).ok).toBe(false);
      expect(c.contador()).toBe(52);
      expect(c.supabase.rpc).not.toHaveBeenCalled();
    }
  });
  it.each(["CARREIRA", "TEMPORARIO"])("vínculo %s com nome de guerra válido reserva normalmente", async (tipo_vinculo) => {
    const c = cliente([{ militar_id: id }], { ...cadastro, tipo_vinculo, nome_guerra: "VICTOR" });
    expect((await chamar(reservarNumeroNbi, c.supabase)).ok).toBe(true);
    expect(c.contador()).toBe(53);
    expect(c.supabase.rpc).toHaveBeenCalledWith("nbi_reservar_numero", expect.objectContaining({ _documento_id: id }));
  });
  it("Cabo temporário sem nome de guerra não é bloqueado", async () => {
    const c = cliente([{ militar_id: id }], { ...cadastro, posto_graduacao: "Cabo" });
    expect((await chamar(reservarNumeroNbi, c.supabase)).ok).toBe(true);
  });
  it("referência textual coincidente não consulta militar nem cria bloqueio", async () => {
    const c = cliente([{ campos: { COMPOSICAO: cadastro.nome }, comissao: [], digitador: { nome: cadastro.nome } }]);
    expect((await chamar(reservarNumeroNbi, c.supabase)).ok).toBe(true);
    expect(c.supabase.from).not.toHaveBeenCalledWith("militares");
  });
});