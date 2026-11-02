import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validarFolgaDocumento } from "../validarFolgaDocumento";
import { motorFolgaCompensatoria } from "../motores/folgaCompensatoria";
import { interpolarTexto, type MilitarNbi } from "@/utils/nbi";
import { ehVarianteInterna } from "@/utils/nbi-categorias";
const militar: MilitarNbi = { id: "ficticio", nome: "TESTE VICTOR DE HOMOLOGACAO", nome_guerra: "VICTOR", posto_graduacao: "Soldado", quadro: "QPBM", tipo_vinculo: "TEMPORARIO", matricula: "9000022", genero_gramatical: "M", lotacao_nbi: "UNIDADE FICTICIA", funcao_atual: null, distribuicao_interna_nbi: null };
const template = { texto_modelo: "{{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}} {{QTD_HORAS}} {{MOTIVO}} {{MES_REFERENCIA}} {{ANO}} {{MES_COMPENSACAO}} {{ANO_RECUPERACAO}}", campos: [{ chave: "QTD_HORAS", label: "Horas", tipo: "inteiro" as const }, { chave: "MOTIVO", label: "Motivo", tipo: "texto" as const }] };
const campos = { SUBTIPO: "saldo_devedor", NATUREZA_SALDO: "DEBITO", QTD_HORAS: "75", MOTIVO: "atividade fictícia", mes_referencia_sel: "2026-12" };
const texto = interpolarTexto(template.texto_modelo, motorFolgaCompensatoria.resolverCampos({ campos, militar, titular: null, camposTemplate: template.campos })).texto;
const assunto = { tipo: "folga_compensatoria", militar_id: militar.id, campos, subtipo: "saldo_devedor", template_codigo: "folga_compensatoria_saldo_devedor", texto_final: texto };
function cliente() {
  const from = vi.fn((t: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = vi.fn(() => q);
    q.maybeSingle = async () => ({ data: t === "militares" ? militar : template, error: null }); return q;
  });
  return { from } as unknown as SupabaseClient<Database>;
}
describe("Coerência Folga persistida", () => {
  it("emissão com campos, template, prévia e metadados coerentes é aceita", async () => expect(await validarFolgaDocumento(cliente(), "ficticio", [assunto])).toBeNull());
  it.each([{ template_codigo: "folga_compensatoria" }, { subtipo: "previsao" }, { texto_final: "texto antigo de crédito" }, { campos: { ...campos, QTD_HORAS: "76" } }])("rejeita divergência persistida %j", async (patch) => expect(await validarFolgaDocumento(cliente(), "ficticio", [{ ...assunto, ...patch }])).not.toBeNull());
  it("duplicação recomposta valida novamente sem mudar a origem", async () => {
    const origem = structuredClone(assunto); const antes = JSON.stringify(origem);
    const copia = structuredClone(origem); copia.campos.QTD_HORAS = "76";
    expect(await validarFolgaDocumento(cliente(), "ficticio", [copia])).not.toBeNull();
    copia.texto_final = interpolarTexto(template.texto_modelo, motorFolgaCompensatoria.resolverCampos({ campos: copia.campos, militar, titular: null, camposTemplate: template.campos })).texto;
    expect(await validarFolgaDocumento(cliente(), "ficticio", [copia])).toBeNull();
    expect(JSON.stringify(origem)).toBe(antes);
  });
  it("legado positivo sem natureza não exige novos metadados ou reescrita", async () => {
    const legado = { ...assunto, campos: { ...campos, SUBTIPO: "previsao", NATUREZA_SALDO: undefined }, texto_final: "texto legado" };
    expect(await validarFolgaDocumento(cliente(), "ficticio", [legado])).toBeNull();
    expect(legado.texto_final).toBe("texto legado");
  });
  it("demais 13 assuntos não recebem validação de horas", async () => {
    for (const tipo of ["ferias", "apresentacao", "viagem", "assuncao_funcao", "dispensa_funcao", "servico_extraordinario", "dispensa_recompensa", "nomeacao_comissao", "licenca_paternidade", "nupcias", "luto", "comunicado", "situacao_sanitaria"]) {
      expect(await validarFolgaDocumento(cliente(), "ficticio", [{ tipo, campos: { QTD_HORAS: "-75" } }])).toBeNull();
    }
  });
  it("template de débito é apenas variante interna do assunto Folga", () => expect(ehVarianteInterna("folga_compensatoria_saldo_devedor")).toBe(true));
});