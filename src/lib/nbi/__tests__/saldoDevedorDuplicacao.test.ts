import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const b = { middleware: () => b, inputValidator: () => b, handler: (h: unknown) => h }; return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert: vi.fn() }) } }));
import { duplicarNbi } from "@/lib/nbi.functions";
import { executarGeracaoNbi } from "../geracaoFluxo";
import { validarFolgaDocumento } from "../validarFolgaDocumento";
import { motorFolgaCompensatoria } from "../motores/folgaCompensatoria";
import { interpolarTexto, type MilitarNbi } from "@/utils/nbi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

it("handler real duplica em memória, recompõe e valida cópia preservando origem e numeração", async () => {
  const militar: MilitarNbi = { id: "militar-ficticio", nome: "TESTE VICTOR", nome_guerra: "VICTOR", posto_graduacao: "Soldado", tipo_vinculo: "TEMPORARIO", quadro: "QPBM", matricula: "9000022", genero_gramatical: "M", lotacao_nbi: "UNIDADE FICTICIA", funcao_atual: null, distribuicao_interna_nbi: null };
  const template = { campos: [{ chave: "QTD_HORAS", tipo: "inteiro" as const, label: "Horas" }, { chave: "MOTIVO", tipo: "texto" as const, label: "Motivo" }], texto_modelo: "{{POSTO_QUADRO}} {{NOME}} {{QTD_HORAS}} {{MOTIVO}} {{MES_COMPENSACAO}} {{ANO_RECUPERACAO}}" };
  const campos = { SUBTIPO: "saldo_devedor", NATUREZA_SALDO: "DEBITO", QTD_HORAS: "75", MOTIVO: "motivo fictício", mes_referencia_sel: "2026-12" };
  const assunto = { tipo: "folga_compensatoria", militar_id: militar.id, campos, subtipo: "saldo_devedor", template_codigo: "folga_compensatoria_saldo_devedor", texto_final: interpolarTexto(template.texto_modelo, motorFolgaCompensatoria.resolverCampos({ campos, militar, titular: null, camposTemplate: template.campos })).texto };
  const origem = { assuntos: [assunto], snapshot: { rascunho: { numero: "012", data_documento: "2026-11-02", modo_numeracao: "manual" } }, status: "gerado", titulo: "TESTE", numero_int: 12, numero_ano_local: 2026 };
  const antes = JSON.stringify(origem);
  let copia: typeof origem | undefined;
  const rpc = vi.fn();
  const client = { rpc, from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: t === "militares" ? militar : t === "nbi_templates" ? template : structuredClone(origem), error: null });
    q.insert = (row: typeof origem) => { copia = structuredClone(row); return q; };
    q.single = async () => ({ data: { id: "copia-ficticia" }, error: null });
    return q;
  } };
  type H = (args: { data: { documento_id: string }; context: unknown }) => Promise<{ ok: boolean; id: string }>;
  const result = await (duplicarNbi as unknown as H)({ data: { documento_id: "origem-ficticia" }, context: { supabase: client, userId: "ficticio" } });
  expect(result.id).toBe("copia-ficticia");
  expect(JSON.stringify(origem)).toBe(antes);
  expect(copia?.snapshot.rascunho.numero).toBe("");
  expect(copia?.snapshot).toMatchObject({ origem_documento_id: "origem-ficticia" });
  if (!copia) throw new Error("Cópia não criada");
  const documento = copia;
  const ordem: string[] = [];
  const saida = await executarGeracaoNbi({ trava: { current: false }, documentoId: result.id,
    persistir: async () => {
      ordem.push("salvar");
      documento.assuntos[0].campos.QTD_HORAS = "76";
      documento.assuntos[0].texto_final = interpolarTexto(template.texto_modelo, motorFolgaCompensatoria.resolverCampos({ campos: documento.assuntos[0].campos, militar, titular: null, camposTemplate: template.campos })).texto;
      return { ok: true, documentoId: result.id };
    },
    gerar: async () => {
      ordem.push("validar");
      expect(await validarFolgaDocumento(client as unknown as SupabaseClient<Database>, "ficticio", documento.assuntos)).toBeNull();
      return { ok: true, numero: 0, ano: 2026 }; // No numbering operation, only isolated generation boundary.
    },
  });
  expect(saida.estado).toBe("sucesso");
  expect(ordem).toEqual(["salvar", "validar"]);
  expect(rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(origem)).toBe(antes);
});