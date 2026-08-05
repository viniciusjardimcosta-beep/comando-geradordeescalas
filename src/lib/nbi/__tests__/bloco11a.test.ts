// Bloco 11A — Núpcias, Luto e Apresentação (agregador).
import { describe, expect, it } from "vitest";
import { obterMotor } from "@/lib/nbi/motores/registry";
import { GRAUS_LUTO, textoGrauLuto, grauPorTexto, DIAS_PADRAO_LUTO } from "@/lib/nbi/luto";
import {
  SUBTIPOS_APRESENTACAO, subtipoPorOrigem, campoDoSubtipoApresentacao,
} from "@/lib/nbi/motores/apresentacao";
import type { ContextoMotor } from "@/lib/nbi/motores/tipos";
import { ehVarianteInterna } from "@/utils/nbi-categorias";

const MILITAR = {
  id: "m1",
  nome: "Soldado Silva",
  matricula: "1234567",
  posto_graduacao: "Soldado",
  quadro: "QPM",
  lotacao_nbi: "1ª CiaBM",
  genero_gramatical: "masculino",
} as unknown as ContextoMotor["militar"];

function ctx(campos: Record<string, string | boolean>, chaves: string[]): ContextoMotor {
  return {
    campos,
    militar: MILITAR,
    titular: null,
    camposTemplate: chaves.map((chave) => ({ chave, label: chave, tipo: "texto" })),
  } as unknown as ContextoMotor;
}

describe("Motor Núpcias", () => {
  const motor = obterMotor("nupcias")!;

  it("está registrado com título oficial", () => {
    expect(motor).toBeTruthy();
    expect(motor.tituloDocumento).toBe("NÚPCIAS");
  });

  it("aplica 8 dias padrão com dois dígitos e extenso", () => {
    const v = motor.resolverCampos(ctx({ DATA_INICIO: "2026-03-02" }, ["DATA_INICIO", "DATA_FIM", "QTD_DIAS", "DATA_APRESENTACAO"]));
    expect(v.QTD_DIAS).toBe("08");
    expect(v.QTD_DIAS_EXTENSO).toBe("oito");
  });

  it("deriva data de apresentação a partir do fim", () => {
    const v = motor.resolverCampos(ctx({ DATA_INICIO: "2026-03-02" }, ["DATA_INICIO", "DATA_FIM", "QTD_DIAS", "DATA_APRESENTACAO"]));
    expect(v.DATA_FIM).toBe("09/03/2026");
    expect(v.DATA_APRESENTACAO).toBe("10/03/2026");
  });

  it("acusa ausência de data de início", () => {
    expect(motor.validar(ctx({}, [])).join(" ")).toMatch(/concess[ãa]o|in[íi]cio/i);
  });
});

describe("Motor Luto", () => {
  const motor = obterMotor("luto")!;

  it("usa catálogo controlado de graus", () => {
    expect(GRAUS_LUTO.length).toBeGreaterThan(0);
    expect(textoGrauLuto("genitora")).toBe("sua Genitora");
    expect(grauPorTexto("seu Genitor")?.id).toBe("genitor");
    expect(DIAS_PADRAO_LUTO).toBe(8);
  });

  it("exige o grau de parentesco", () => {
    const erros = motor.validar(ctx({ DATA_INICIO: "2026-04-01" }, ["DATA_INICIO", "MOTIVO_LUTO", "DATA_FIM", "QTD_DIAS", "DATA_APRESENTACAO"]));
    expect(erros.join(" ")).toMatch(/MOTIVO_LUTO|parentesco|falecimento/i);
  });

  it("aceita grau do catálogo e aplica 8 dias", () => {
    const c = ctx(
      { DATA_INICIO: "2026-04-01", MOTIVO_LUTO: "seu Genitor" },
      ["DATA_INICIO", "MOTIVO_LUTO", "DATA_FIM", "QTD_DIAS", "DATA_APRESENTACAO"],
    );
    const v = motor.resolverCampos(c);
    expect(v.QTD_DIAS).toBe("08");
    expect(v.MOTIVO_LUTO).toBe("seu Genitor");
    expect(motor.validar(c)).toHaveLength(0);
  });
});

describe("Agregador de Apresentação", () => {
  const motor = obterMotor("apresentacao")!;

  it("mantém título único e escolhe o template pelo subtipo", () => {
    expect(motor.tituloDocumento).toBe("APRESENTAÇÃO");
    const alvo = (sub: string) =>
      motor.codigoTemplateEfetivo?.(ctx({ SUBTIPO: sub }, []));
    expect(alvo("ferias")).toBe("apresentacao");
    expect(alvo("nupcias")).toBe("apresentacao_nupcias");
    expect(alvo("luto")).toBe("apresentacao_luto");
  });

  it("período e ano existem apenas na redação de férias", () => {
    expect(campoDoSubtipoApresentacao("ferias", "PERIODO")).toBe(true);
    expect(campoDoSubtipoApresentacao("nupcias", "PERIODO")).toBe(false);
    expect(campoDoSubtipoApresentacao("luto", "ANO")).toBe(false);
    const v = motor.resolverCampos(
      ctx({ SUBTIPO: "nupcias", PERIODO: "1", DATA_APRESENTACAO: "2026-03-10", QTD_DIAS: "8" },
        ["SUBTIPO", "PERIODO", "DATA_APRESENTACAO", "QTD_DIAS"]),
    );
    expect(v.PERIODO).toBeUndefined();
    expect(v.ANO).toBeUndefined();
  });

  it("bloqueia subtipo sem exemplar oficial", () => {
    const erros = motor.validar(
      ctx({ SUBTIPO: "licenca_paternidade", DATA_APRESENTACAO: "2026-07-07", QTD_DIAS: "30" },
        ["SUBTIPO", "DATA_APRESENTACAO", "QTD_DIAS"]),
    );
    expect(erros.join(" ")).toMatch(/exemplar oficial/i);
  });

  it("liga cada afastamento ao seu subtipo de apresentação", () => {
    expect(subtipoPorOrigem("ferias")?.id).toBe("ferias");
    expect(subtipoPorOrigem("nupcias")?.id).toBe("nupcias");
    expect(subtipoPorOrigem("luto")?.id).toBe("luto");
    expect(subtipoPorOrigem("viagem")).toBeNull();
  });

  it("variantes de redação nunca aparecem no seletor", () => {
    for (const s of SUBTIPOS_APRESENTACAO) {
      if (s.template === "apresentacao") continue;
      expect(ehVarianteInterna(s.template)).toBe(true);
    }
  });
});
