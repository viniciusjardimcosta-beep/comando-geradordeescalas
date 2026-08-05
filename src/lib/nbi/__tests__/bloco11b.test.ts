// Bloco 11B — homologação do motor FOLGA COMPENSATÓRIA.
// Comparação frase a frase com os exemplares oficiais:
//   NBI nº 14/2026, nº 18/2026, nº 21/2026 e NBI nº 28/2025.
import { describe, it, expect } from "vitest";
import {
  calcularMesesFolga, MOTIVOS_FOLGA, textoMotivoFolga, motivoFolgaPorTexto,
  SUBTIPOS_FOLGA, campoDoSubtipoFolga,
} from "@/lib/nbi/folgaCompensatoria";
import { motorFolgaCompensatoria } from "@/lib/nbi/motores/folgaCompensatoria";
import { obterMotor } from "@/lib/nbi/motores/registry";
import type { ContextoMotor, CampoTemplate } from "@/lib/nbi/motores/tipos";
import type { MilitarNbi } from "@/utils/nbi";

const MILITAR: MilitarNbi = {
  id: "m1",
  nome: "ADEMIR THOME GUNSCH",
  nome_guerra: "GUNSCH",
  posto_graduacao: "1ºSGT",
  matricula: "2992760",
  quadro: "QPBM",
  lotacao_nbi: "2ºPelBM/2ªCiaBM/12ºBBM PANAMBI",
  funcao_atual: null,
  distribuicao_interna_nbi: null,
  genero_gramatical: "M",
};

const MILITAR_F: MilitarNbi = {
  ...MILITAR,
  id: "m2",
  nome: "MARIANA PIZUTTI DALLABRIDA",
  posto_graduacao: "SD",
  matricula: "4843371",
  genero_gramatical: "F",
};

const CHAVES: CampoTemplate[] = [
  { chave: "mes_referencia_sel", label: "Mês de referência", tipo: "mes", obrigatorio: true },
  { chave: "QTD_HORAS", label: "Quantidade de horas", tipo: "inteiro", obrigatorio: true },
  { chave: "MOTIVO", label: "Motivo", tipo: "texto", obrigatorio: true },
  { chave: "MES_REFERENCIA", label: "Mês (extenso)", tipo: "texto" },
  { chave: "MES_COMPENSACAO", label: "Mês da compensação", tipo: "texto" },
  { chave: "ANO", label: "Ano", tipo: "texto" },
];

function ctx(campos: Record<string, string>, militar = MILITAR): ContextoMotor {
  return { campos, militar, titular: null, camposTemplate: CHAVES };
}

// Redações oficiais (idênticas às gravadas em nbi_templates).
const MODELO_PREVISAO =
  "{{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, em virtude de {{MOTIVO}}, "
  + "possui {{QTD_HORAS}} horas a serem compensadas referentes ao mês de {{MES_REFERENCIA}}, "
  + "conforme mapa de escala de serviço executado. Há previsão de compensar estas horas no mês de {{MES_COMPENSACAO}}.";

const MODELO_REALIZADA =
  "{{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, compensou, "
  + "no mês de {{MES_COMPENSACAO}}, {{QTD_HORAS}} horas de serviço pendentes referentes ao mês de "
  + "{{MES_REFERENCIA}} de {{ANO}}, conforme mapa de escala de serviço executado naquele mês.";

function render(modelo: string, valores: Record<string, string>): string {
  return modelo.replace(/\{\{(\w+)\}\}/g, (_, k) => valores[k] ?? `{{${k}}}`);
}

describe("Bloco 11B — cálculo dos meses", () => {
  it("mês comum: junho → julho", () => {
    const r = calcularMesesFolga("2026-06")!;
    expect(r.referencia).toBe("junho");
    expect(r.compensacao).toBe("julho");
    expect(r.ano).toBe("2026");
    expect(r.viradaDeAno).toBe(false);
  });

  it("julho → agosto (exemplar NBI 21/2026)", () => {
    const r = calcularMesesFolga("2026-07")!;
    expect(r.referencia).toBe("julho");
    expect(r.compensacao).toBe("agosto");
  });

  it("dezembro → janeiro do ano seguinte", () => {
    const r = calcularMesesFolga("2026-12")!;
    expect(r.referencia).toBe("dezembro");
    expect(r.compensacao).toBe("janeiro");
    expect(r.ano).toBe("2026");
    expect(r.anoCompensacao).toBe("2027");
    expect(r.viradaDeAno).toBe(true);
  });

  it("cobre os 12 meses do ano sem lacuna", () => {
    const esperado = [
      "fevereiro", "março", "abril", "maio", "junho", "julho",
      "agosto", "setembro", "outubro", "novembro", "dezembro", "janeiro",
    ];
    for (let m = 1; m <= 12; m++) {
      const r = calcularMesesFolga(`2026-${String(m).padStart(2, "0")}`)!;
      expect(r.compensacao).toBe(esperado[m - 1]);
    }
  });

  it("rejeita entrada inválida", () => {
    expect(calcularMesesFolga("")).toBeNull();
    expect(calcularMesesFolga("2026-13")).toBeNull();
    expect(calcularMesesFolga("junho")).toBeNull();
  });
});

describe("Bloco 11B — catálogo de motivos", () => {
  it("expõe os motivos observados nos exemplares e a opção livre", () => {
    expect(MOTIVOS_FOLGA.map((m) => m.id)).toEqual([
      "ajustes_finais_mapa", "ajustes_escala", "outro",
    ]);
    expect(textoMotivoFolga("ajustes_finais_mapa")).toBe("ajustes finais no mapa");
    expect(textoMotivoFolga("ajustes_escala")).toBe("ajustes no mapa por conta de ajustes de escala");
    expect(textoMotivoFolga("outro")).toBeNull();
  });

  it("reconhece o motivo gravado ao reabrir o rascunho", () => {
    expect(motivoFolgaPorTexto("ajustes finais no mapa")?.id).toBe("ajustes_finais_mapa");
    expect(motivoFolgaPorTexto("necessidade de COV")).toBeNull();
  });
});

describe("Bloco 11B — motor exclusivo", () => {
  it("está registrado e é exclusivo do assunto", () => {
    expect(obterMotor("folga_compensatoria")).toBe(motorFolgaCompensatoria);
    expect(motorFolgaCompensatoria.tituloDocumento).toBe("FOLGA COMPENSATÓRIA");
    expect(motorFolgaCompensatoria.nivelHomologacao).toBe("HOMOLOGADO");
  });

  it("resolve campos automáticos a partir do cadastro e do mês", () => {
    const v = motorFolgaCompensatoria.resolverCampos(ctx({
      SUBTIPO: "previsao", mes_referencia_sel: "2026-06", QTD_HORAS: "33",
      MOTIVO: "ajustes no mapa por conta de ajustes de escala",
    }));
    expect(v.POSTO_QUADRO).toBe("1ºSGT QPBM");
    expect(v.ID_FUNC).toBe("2992760");
    expect(v.LOTACAO).toContain("PANAMBI");
    expect(v.MES_REFERENCIA).toBe("junho");
    expect(v.MES_COMPENSACAO).toBe("julho");
    expect(v.ARTIGO_O_A_CAP).toBe("O");
  });

  it("seleciona a redação oficial conforme o subtipo", () => {
    expect(motorFolgaCompensatoria.codigoTemplateEfetivo!(ctx({ SUBTIPO: "previsao" })))
      .toBe("folga_compensatoria");
    expect(motorFolgaCompensatoria.codigoTemplateEfetivo!(ctx({ SUBTIPO: "realizada" })))
      .toBe("folga_compensatoria_realizada");
    expect(SUBTIPOS_FOLGA).toHaveLength(2);
  });

  it("bloqueia horas ausentes, mês ausente e motivo ausente", () => {
    const erros = motorFolgaCompensatoria.validar(ctx({ SUBTIPO: "previsao" }));
    expect(erros.join(" ")).toMatch(/horas/i);
    expect(erros.join(" ")).toMatch(/mês de referência/i);
    expect(erros.join(" ")).toMatch(/motivo/i);
  });

  it("não exige motivo na variante de compensação realizada", () => {
    const erros = motorFolgaCompensatoria.validar(ctx({
      SUBTIPO: "realizada", mes_referencia_sel: "2026-05", QTD_HORAS: "24",
    }));
    expect(erros.some((e) => /motivo/i.test(e))).toBe(false);
    expect(campoDoSubtipoFolga("realizada", "MOTIVO")).toBe(false);
    expect(campoDoSubtipoFolga("previsao", "MOTIVO")).toBe(true);
  });

  it("aceita qualquer quantidade de horas (4 e 33)", () => {
    for (const h of ["4", "33", "128"]) {
      const erros = motorFolgaCompensatoria.validar(ctx({
        SUBTIPO: "previsao", mes_referencia_sel: "2026-07", QTD_HORAS: h,
        MOTIVO: "ajustes finais no mapa",
      }));
      expect(erros.some((e) => /horas/i.test(e))).toBe(false);
    }
  });
});

describe("Bloco 11B — fidelidade aos exemplares oficiais", () => {
  it("NBI 28/2025 — SD MARIANA, 4 horas, julho → agosto", () => {
    const v = motorFolgaCompensatoria.montarPlaceholders(ctx({
      SUBTIPO: "previsao", mes_referencia_sel: "2025-07", QTD_HORAS: "4",
      MOTIVO: "ajustes finais no mapa",
    }, MILITAR_F));
    expect(render(MODELO_PREVISAO, v)).toBe(
      "A SD QPBM MARIANA PIZUTTI DALLABRIDA, ID FUNC 4843371, em virtude de ajustes finais no mapa, "
      + "possui 4 horas a serem compensadas referentes ao mês de julho, conforme mapa de escala de "
      + "serviço executado. Há previsão de compensar estas horas no mês de agosto.",
    );
  });

  it("NBI 18/2026 — 1ºSGT ADEMIR, 33 horas, junho → julho", () => {
    const v = motorFolgaCompensatoria.montarPlaceholders(ctx({
      SUBTIPO: "previsao", mes_referencia_sel: "2026-06", QTD_HORAS: "33",
      MOTIVO: "ajustes no mapa por conta de ajustes de escala",
    }));
    expect(render(MODELO_PREVISAO, v)).toBe(
      "O 1ºSGT QPBM ADEMIR THOME GUNSCH, ID FUNC 2992760, em virtude de ajustes no mapa por conta de "
      + "ajustes de escala, possui 33 horas a serem compensadas referentes ao mês de junho, conforme "
      + "mapa de escala de serviço executado. Há previsão de compensar estas horas no mês de julho.",
    );
  });

  it("NBI 21/2026 — compensação realizada: junho compensado em julho", () => {
    const v = motorFolgaCompensatoria.montarPlaceholders(ctx({
      SUBTIPO: "realizada", mes_referencia_sel: "2026-06", QTD_HORAS: "33",
    }));
    expect(render(MODELO_REALIZADA, v)).toBe(
      "O 1ºSGT QPBM ADEMIR THOME GUNSCH, ID FUNC 2992760, do 2ºPelBM/2ªCiaBM/12ºBBM PANAMBI, "
      + "compensou, no mês de julho, 33 horas de serviço pendentes referentes ao mês de junho de 2026, "
      + "conforme mapa de escala de serviço executado naquele mês.",
    );
  });

  it("nenhum placeholder fica sem valor na geração", () => {
    const v = motorFolgaCompensatoria.montarPlaceholders(ctx({
      SUBTIPO: "previsao", mes_referencia_sel: "2026-12", QTD_HORAS: "12",
      MOTIVO: "ajustes finais no mapa",
    }));
    const texto = render(MODELO_PREVISAO, v);
    expect(texto).not.toMatch(/\{\{/);
    expect(texto).toContain("referentes ao mês de dezembro");
    expect(texto).toContain("no mês de janeiro");
  });
});
