// Bloco 10C — provas automatizadas das correções exigidas.
import { describe, it, expect } from "vitest";
import { formatarDataBR, formatarDataFlexivelBR } from "@/utils/nbi";
import { normalizarLocalidade } from "@/utils/nbi-toponimos";
import { normalizarCabecalho } from "@/lib/nbi/cabecalho";
import { detectarDuplicidades, assinaturaDeAssunto } from "@/lib/nbi/duplicidade";
import { resolverDataDispensa } from "@/lib/nbi/dataDispensa";

describe("3. Data do Boletim — caso real 05/072026", () => {
  it("corrige a concatenação manual observada na NBI 045", () => {
    expect(formatarDataFlexivelBR("05/072026")).toBe("05/07/2026");
  });

  it("formata a data ISO do boletim sem concatenar dia/mês/ano", () => {
    expect(formatarDataBR("2026-07-05")).toBe("05/07/2026");
    expect(formatarDataFlexivelBR("2026-07-05")).toBe("05/07/2026");
  });

  it("tolera formatos legados sem inventar valores", () => {
    expect(formatarDataFlexivelBR("5/7/26")).toBe("05/07/2026");
    expect(formatarDataFlexivelBR("05072026")).toBe("05/07/2026");
    expect(formatarDataFlexivelBR("05.07.2026")).toBe("05/07/2026");
    expect(formatarDataFlexivelBR("")).toBe("");
    expect(formatarDataFlexivelBR("Boletim especial")).toBe("Boletim especial");
  });
});

describe("7. Topônimos aplicados ao valor enviado ao DOCX", () => {
  it("corrige São Sebastiao → São Sebastião/RS", () => {
    expect(normalizarLocalidade("São Sebastiao").formatado).toBe("São Sebastião/RS");
    expect(normalizarLocalidade("sao sebastiao").formatado).toBe("São Sebastião/RS");
  });

  it("gera São Geraldo/RS", () => {
    expect(normalizarLocalidade("São Geraldo").formatado).toBe("São Geraldo/RS");
  });

  it("preserva UF já informada e não inventa UF para desconhecidos", () => {
    expect(normalizarLocalidade("Curitiba/PR").formatado).toBe("Curitiba/PR");
    expect(normalizarLocalidade("Vila Nova do Interior").uf).toBeNull();
  });
});

describe("6. Cabeçalho normalizado na geração", () => {
  it("normaliza batalhão e companhia mesmo com configuração antiga", () => {
    const c = normalizarCabecalho({
      batalhao: "15ª batalhao de bombeiros militar",
      subunidade: "8º  companhia de bombeiros  militar",
    });
    expect(c.batalhao).toBe("15º BATALHÃO DE BOMBEIROS MILITAR");
    expect(c.subunidade).toBe("8ª COMPANHIA DE BOMBEIROS MILITAR");
  });

  it("preserva exceções confirmadas manualmente (prefixo !)", () => {
    const c = normalizarCabecalho({ batalhao: "!Comando Regional de Bombeiros" });
    expect(c.batalhao).toBe("Comando Regional de Bombeiros");
  });
});

describe("8. Duplicidade por assinatura específica do motor", () => {
  const base = { militar_id: "m1", campos: {} as Record<string, string> };

  it("não bloqueia duas viagens no mesmo dia para destinos diferentes", () => {
    const dups = detectarDuplicidades([
      { ...base, id: "a", tipo: "viagem", campos: { DATA_INICIO: "2026-07-20", DESTINO: "São Geraldo/RS", MISSAO: "Material" } },
      { ...base, id: "b", tipo: "viagem", campos: { DATA_INICIO: "2026-07-20", DESTINO: "Casca/RS", MISSAO: "Curso" } },
    ]);
    expect(dups).toHaveLength(0);
  });

  it("bloqueia o mesmo período de férias lançado duas vezes", () => {
    const dups = detectarDuplicidades([
      { ...base, id: "a", tipo: "ferias", campos: { PERIODO: "1", ANO: "2026", DATA_INICIO: "2026-07-01" } },
      { ...base, id: "b", tipo: "ferias", campos: { PERIODO: "1", ANO: "2026", DATA_INICIO: "2026-07-01" } },
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].indices).toEqual([0, 1]);
  });

  it("distingue duas assunções do mesmo par por função", () => {
    const a1 = assinaturaDeAssunto({ ...base, id: "a", tipo: "assuncao_funcao", militar_titular_id: "t1", campos: { DATA_INICIO: "2026-07-01", FUNCAO_ASSUMIDA: "Sgte" } });
    const a2 = assinaturaDeAssunto({ ...base, id: "b", tipo: "assuncao_funcao", militar_titular_id: "t1", campos: { DATA_INICIO: "2026-07-01", FUNCAO_ASSUMIDA: "Chefe da SSCI" } });
    expect(a1).not.toBe(a2);
  });
});

describe("2. Prioridade da data da dispensa", () => {
  const ferias = [{ militar_id: "t1", data_inicio: "2026-07-01", data_fim: "2026-07-11" }];

  it("1º — data_fim_prevista da substituição", () => {
    const r = resolverDataDispensa(
      { id: "s1", titular_militar_id: "t1", data_inicio: "2026-07-01", data_fim_prevista: "2026-07-12" },
      ferias, null,
    );
    expect(r.valor).toBe("2026-07-12");
    expect(r.fonte).toBe("substituicao_prevista");
  });

  it("2º — férias do titular + 1 dia", () => {
    const r = resolverDataDispensa(
      { id: "s1", titular_militar_id: "t1", data_inicio: "2026-07-01", data_fim_prevista: null },
      ferias, null,
    );
    expect(r.valor).toBe("2026-07-12");
    expect(r.fonte).toBe("ferias_titular");
  });

  it("3º — snapshot da assunção", () => {
    const r = resolverDataDispensa(
      { id: "s1", titular_militar_id: null, data_inicio: "2026-07-01", data_fim_prevista: null },
      [], { DATA_FIM: "2026-08-01" },
    );
    expect(r.valor).toBe("2026-08-01");
    expect(r.fonte).toBe("snapshot_assuncao");
  });

  it("4º — manual quando nenhuma fonte existe", () => {
    const r = resolverDataDispensa(
      { id: "s1", titular_militar_id: null, data_inicio: null, data_fim_prevista: null },
      [], null,
    );
    expect(r.valor).toBe("");
    expect(r.fonte).toBe("manual");
  });
});
