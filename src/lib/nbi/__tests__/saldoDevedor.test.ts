import { describe, expect, it } from "vitest";
import { calcularMesesFolga, validarFolgaCompensatoria, subtipoFolga } from "../folgaCompensatoria";
import { motorFolgaCompensatoria } from "../motores/folgaCompensatoria";
const base = { SUBTIPO: "saldo_devedor", NATUREZA_SALDO: "DEBITO", QTD_HORAS: "75", MOTIVO: "atividade fictícia A", mes_referencia_sel: "2026-12" };
describe("Saldo devedor — regras aprovadas", () => {
  it("débito de 75 com motivo é válido", () => expect(validarFolgaCompensatoria(base)).toEqual([]));
  it.each(["previsao", "realizada"])("crédito %s e legado continuam válidos", (SUBTIPO) => {
    expect(validarFolgaCompensatoria({ ...base, SUBTIPO, NATUREZA_SALDO: "CREDITO" })).toEqual([]);
    expect(validarFolgaCompensatoria({ ...base, SUBTIPO, NATUREZA_SALDO: undefined })).toEqual([]);
  });
  it.each(["", "0", "-75", "75.5", "75,5", "75abc", "abc", null, true])("rejeita magnitude %s", (QTD_HORAS) => {
    expect(validarFolgaCompensatoria({ ...base, QTD_HORAS }).join()).toContain("inteiro positivo");
  });
  it.each(["", "   ", null])("motivo %s é obrigatório", (MOTIVO) => expect(validarFolgaCompensatoria({ ...base, MOTIVO }).join()).toContain("motivo"));
  it("motivo variável permanece válido e não é reformulado", () => {
    const campos = { ...base, MOTIVO: "outro motivo fictício B" };
    expect(validarFolgaCompensatoria(campos)).toEqual([]);
    expect(campos.MOTIVO).toBe("outro motivo fictício B");
  });
  it.each(["previsao", "realizada"])("débito não usa %s", (SUBTIPO) => expect(validarFolgaCompensatoria({ ...base, SUBTIPO }).join()).toContain("natureza"));
  it("crédito não usa saldo devedor", () => expect(validarFolgaCompensatoria({ ...base, NATUREZA_SALDO: "CREDITO" }).join()).toContain("natureza"));
  it("subtipo desconhecido não cai em crédito", () => {
    expect(validarFolgaCompensatoria({ ...base, SUBTIPO: "inexistente" }).join()).toContain("desconhecido");
    expect(() => subtipoFolga("inexistente")).toThrow();
  });
  it.each([["2026-10", "novembro", "2026"], ["2026-11", "dezembro", "2026"], ["2026-12", "janeiro", "2027"]])("%s recupera em %s/%s", (ref, mes, ano) => {
    expect(calcularMesesFolga(ref)).toMatchObject({ compensacao: mes, anoCompensacao: ano });
  });
  it.each(["2026-00", "2026-13", "0000-12", "abc", "", "2026-12-01"])("rejeita mês/ano %s", (mes_referencia_sel) => expect(validarFolgaCompensatoria({ ...base, mes_referencia_sel }).join()).toContain("ano"));
  it("motor usa mesmo validador e fornece ano de recuperação", () => {
    const ctx = { campos: base, militar: null, titular: null, camposTemplate: [{ chave: "QTD_HORAS", label: "Horas", tipo: "inteiro" as const }, { chave: "MOTIVO", label: "Motivo", tipo: "texto" as const }] };
    expect(motorFolgaCompensatoria.codigoTemplateEfetivo?.(ctx)).toBe("folga_compensatoria_saldo_devedor");
    expect(motorFolgaCompensatoria.resolverCampos(ctx).ANO_RECUPERACAO).toBe("2027");
    expect(motorFolgaCompensatoria.validar({ ...ctx, campos: { ...base, QTD_HORAS: "75abc" } }).join()).toContain("inteiro positivo");
  });
});