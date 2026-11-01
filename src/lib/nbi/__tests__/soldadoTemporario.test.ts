import { describe, it, expect } from "vitest";
import { identificacaoNbi, idsMilitaresEstruturadosNbi, interpolarTexto, type MilitarNbi } from "@/utils/nbi";
import { resolverBase, validarMilitar, validarTitular } from "@/lib/nbi/motores/comum";
import { listarMotores } from "@/lib/nbi/motores/registry";
import type { ContextoMotor } from "@/lib/nbi/motores/tipos";

const victor: MilitarNbi = {
  id: "00000000-0000-4000-8000-000000000001", nome: "TESTE VICTOR DE HOMOLOGACAO",
  nome_guerra: "VICTOR", posto_graduacao: "Soldado", quadro: "QPBM", tipo_vinculo: "TEMPORARIO",
  matricula: "9000022", lotacao_nbi: "UNIDADE FICTICIA", funcao_atual: "FUNCAO FICTICIA",
  distribuicao_interna_nbi: null, genero_gramatical: "M",
};
const contexto = (militar = victor, titular: MilitarNbi | null = null): ContextoMotor => ({
  militar, titular, camposTemplate: [], campos: {},
});
const identidade = (m: MilitarNbi) => {
  const i = identificacaoNbi(m);
  return `${i.posto_quadro} ${i.nome}`;
};

describe("Soldado Temporário — identificação estritamente estruturada", () => {
  it("Soldado CARREIRA mantém posto/quadro e nome completo", () => {
    expect(identidade({ ...victor, tipo_vinculo: "CARREIRA" })).toBe("Soldado QPBM TESTE VICTOR DE HOMOLOGACAO");
  });
  it("Soldado TEMPORARIO usa SD TEMP SBMET VICTOR", () => {
    expect(identidade(victor)).toBe("SD TEMP SBMET VICTOR");
  });
  it("não permite nome completo ou placeholder antigo substituir o nome de guerra", () => {
    const c = contexto();
    c.camposTemplate = ["NOME", "POSTO_QUADRO"].map((chave) => ({ chave, label: chave, tipo: "text" }));
    c.campos = { NOME: victor.nome, POSTO_QUADRO: "Soldado QPBM" };
    const valores = resolverBase(c);
    const texto = interpolarTexto("{{POSTO_QUADRO}} {{NOME}}", valores).texto;
    expect(texto).toBe("SD TEMP SBMET VICTOR");
    expect(texto).not.toContain(victor.nome);
  });
  it.each([null, "", "   "])("bloqueia nome de guerra inválido %s sem fallback", (nome_guerra) => {
    const m = { ...victor, nome_guerra };
    expect(identificacaoNbi(m).nome).toBe("");
    expect(validarMilitar(contexto(m))).toContain("Informe o nome de guerra do Soldado Temporário antes de gerar a NBI.");
  });
  it("identifica temporário e carreira individualmente", () => {
    expect([victor, { ...victor, tipo_vinculo: "CARREIRA" as const }].map(identidade))
      .toEqual(["SD TEMP SBMET VICTOR", "Soldado QPBM TESTE VICTOR DE HOMOLOGACAO"]);
  });
  it("dois temporários usam seus próprios nomes de guerra", () => {
    expect([victor, { ...victor, id: "outro-id", nome_guerra: "WHISKEY" }].map(identidade))
      .toEqual(["SD TEMP SBMET VICTOR", "SD TEMP SBMET WHISKEY"]);
  });
  it("outros postos de carreira permanecem iguais", () => {
    expect(identidade({ ...victor, posto_graduacao: "Cabo", tipo_vinculo: "CARREIRA" }))
      .toBe("Cabo QPBM TESTE VICTOR DE HOMOLOGACAO");
  });
  it("outro posto temporário mantém identificação e recebe aviso não bloqueante", () => {
    const m = { ...victor, posto_graduacao: "Cabo", nome_guerra: null };
    expect(identidade(m)).toBe("Cabo QPBM TESTE VICTOR DE HOMOLOGACAO");
    expect(identificacaoNbi(m).aviso).toBeTruthy();
    expect(identificacaoNbi(m).pendencia).toBeNull();
  });
  it("posto não canônico não inventa nomenclatura", () => {
    expect(identificacaoNbi({ ...victor, posto_graduacao: "GRADUACAO FICTICIA" }).soldadoTemporario).toBe(false);
  });
  it("titular recebe a mesma identificação e validação", () => {
    const c = contexto({ ...victor, tipo_vinculo: "CARREIRA" }, victor);
    expect(resolverBase(c).NOME_TITULAR).toBe("VICTOR");
    expect(resolverBase(c).POSTO_QUADRO_TITULAR).toBe("SD TEMP SBMET");
    c.titular = { ...victor, nome_guerra: null };
    expect(validarTitular(c)).toContain("Informe o nome de guerra do Soldado Temporário antes de gerar a NBI.");
  });
  it("Comissão estruturada usa helper central com cadastro atual", () => {
    const c = contexto();
    c.campos = { integrantes_json: JSON.stringify([{ id: "i", tipo: "militar", militar_id: victor.id }]), COMPOSICAO: "texto antigo" };
    expect(resolverBase(c, { militares: [victor] }).COMPOSICAO).toBe("SD TEMP SBMET VICTOR, ID FUNC 9000022");
  });
  it("Comissão puramente textual preserva conteúdo coincidente com nome cadastrado", () => {
    const c = contexto();
    c.camposTemplate = [{ chave: "COMPOSICAO", label: "Composição", tipo: "text" }];
    c.campos = { COMPOSICAO: "Soldado Temporário TESTE VICTOR DE HOMOLOGACAO", integrantes_json: "[]" };
    expect(resolverBase(c, { militares: [victor] }).COMPOSICAO).toBe(c.campos.COMPOSICAO);
  });
  it.each(["digitador", "comandante", "autoridade"])("%s textual não é identificado nem bloqueado", (papel) => {
    const texto = { [papel]: { nome: victor.nome, posto_quadro: "Soldado Temporário" } };
    const antes = JSON.stringify(texto);
    expect(idsMilitaresEstruturadosNbi([texto])).toEqual([]);
    expect(JSON.stringify(texto)).toBe(antes);
  });
  it("texto sem ID não cria exigência de nome de guerra", () => {
    expect(idsMilitaresEstruturadosNbi([{ campos: { COMPOSICAO: victor.nome, nome_guerra: "VICTOR" } }])).toEqual([]);
  });
  it("coleta principal, titular, Comissão e substituição, sem inferir externo", () => {
    expect(idsMilitaresEstruturadosNbi([{
      militar_id: "principal", militar_titular_id: "titular",
      substituicao: { titular_militar_id: "titular", substituto_militar_id: "principal" },
      comissao: [{ tipo: "militar", militar_id: "comissao" }, { tipo: "externo", militar_id: "ignorado", nome: victor.nome }],
    }])).toEqual(["principal", "titular", "comissao"]);
  });
  it("não infere vínculo de posto ou quadro quando classificação ausente", () => {
    const m = { ...victor, tipo_vinculo: undefined, posto_graduacao: "Soldado Temporário", quadro: "SD Temp" };
    expect(identificacaoNbi(m).soldadoTemporario).toBe(false);
    expect(identificacaoNbi(m).nome).toBe(victor.nome);
  });
  it("reconhecimento utiliza o mecanismo canônico existente, incluindo SD", () => {
    expect(identidade({ ...victor, posto_graduacao: "SD" })).toBe("SD TEMP SBMET VICTOR");
  });
  it("histórico é intocado e duplicação recomposta usa cadastro atual", () => {
    const historico = Object.freeze({ texto_final: "Soldado QPBM TESTE VICTOR DE HOMOLOGACAO" });
    const novo = interpolarTexto("{{POSTO_QUADRO}} {{NOME}}", resolverBase(contexto())).texto;
    expect(novo).toBe("SD TEMP SBMET VICTOR");
    expect(historico.texto_final).toBe("Soldado QPBM TESTE VICTOR DE HOMOLOGACAO");
  });
  it("todos os 13 assuntos principais mantêm suas validações de carreira", () => {
    const motores = listarMotores();
    expect(motores).toHaveLength(13);
    for (const motor of motores) {
      const c = contexto({ ...victor, tipo_vinculo: "CARREIRA" });
      expect(motor.validar(c)).toEqual(motor.validar(contexto({ ...victor, tipo_vinculo: undefined })));
    }
  });
});