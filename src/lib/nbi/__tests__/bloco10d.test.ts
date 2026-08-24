// Bloco 10D — padronização institucional, viagem e auditoria pré-geração.
import { describe, it, expect } from "vitest";
import { sugerirInstitucional, normalizarInstitucional } from "@/utils/nbi-institucional";
import { auditarPreGeracao } from "@/lib/nbi/auditoria";

function lot(v: string) { return sugerirInstitucional(v, "lotacao"); }

describe("siglas institucionais canônicas", () => {
  it("BBM permanece BBM", () => {
    expect(lot("15ºBBM")).toBeNull();
  });
  it('"15ºbbm" sugere "15ºBBM"', () => {
    expect(lot("15ºbbm")?.correcao).toBe("15ºBBM");
  });
  it('"8ªcia" sugere "8ªCiaBM"', () => {
    expect(lot("8ªcia")?.correcao).toBe("8ªCiaBM");
  });
  it('"6ºpel" sugere "6ºPelBM"', () => {
    expect(lot("6ºpel")?.correcao).toBe("6ºPelBM");
  });
  it("lotação canônica completa não gera sugestão", () => {
    expect(lot("15ºBBM/8ªCiaBM/6ºPelBM")).toBeNull();
  });
  it("lotação com siglas minúsculas é canonizada sem virar nome próprio", () => {
    const s = lot("15ºbbm/8ªcia/6ºpel");
    expect(s?.correcao).toBe("15ºBBM/8ªCiaBM/6ºPelBM");
    expect(s?.correcao).not.toMatch(/Bbm|Cia\b|Pel\b/);
  });
  it("QPBM não vira Qpbm", () => {
    expect(lot("QPBM")).toBeNull();
    expect(lot("qpbm")?.correcao).toBe("QPBM");
  });
  it("SSCI não vira Ssci", () => {
    expect(lot("SSCI")).toBeNull();
    expect(lot("ssci")?.correcao).toBe("SSCI");
  });
  it("SLOG não vira Slog", () => {
    expect(lot("SLOG")).toBeNull();
    expect(lot("slog")?.correcao).toBe("SLOG");
  });
  it("lotação com seção e cidade preserva siglas", () => {
    expect(lot("SSCI/8ªCiaBM/15ºBBM CAMPINAS")).toBeNull();
  });
});

describe("cabeçalho institucional", () => {
  it("usa Bombeiros no plural", () => {
    expect(normalizarInstitucional("15º BATALHÃO DE BOMBEIRO MILITAR"))
      .toBe("15º BATALHÃO DE BOMBEIROS MILITAR");
  });
  it("companhia usa ordinal feminino", () => {
    expect(normalizarInstitucional("8º COMPANHIA DE BOMBEIROS MILITAR"))
      .toBe("8ª COMPANHIA DE BOMBEIROS MILITAR");
  });
  it("batalhão usa ordinal masculino", () => {
    expect(normalizarInstitucional("15ª BATALHÃO")).toBe("15º BATALHÃO");
  });
});

describe("auditoria pré-geração", () => {
  const base = {
    duplicados: [], divergenciasAno: [],
    cabecalhoOk: true, digitadorOk: true, comandanteOk: true, numeracaoOk: true,
  };

  it("detecta erro bloqueante", () => {
    const r = auditarPreGeracao({
      ...base,
      assuntos: [{
        titulo: "Viagem", militar: "FULANO DE TAL",
        pendencias: ["função documental ausente no cadastro de FULANO DE TAL"],
        ausentes: [], texto: "texto oficial.",
      }],
    });
    expect(r.bloqueado).toBe(true);
    expect(r.erros).toBe(1);
    expect(r.grupos.find((g) => g.chave === "institucional")?.status).toBe("erro");
  });

  it("não acusa sigla institucional válida", () => {
    const r = auditarPreGeracao({
      ...base,
      assuntos: [{
        titulo: "Assunção de função", militar: "FULANO DE TAL", titular: "Sgt BELTRANO",
        exigeTitular: true, pendencias: [], ausentes: [],
        texto: "assume a função de Chefe da SSCI do 15ºBBM/8ªCiaBM/6ºPelBM.",
      }],
    });
    expect(r.bloqueado).toBe(false);
    expect(r.erros).toBe(0);
    expect(r.grupos.every((g) => g.status === "ok")).toBe(true);
  });

  it("ano divergente é alerta, não bloqueio", () => {
    const r = auditarPreGeracao({
      ...base,
      divergenciasAno: ["Férias · Data início: 2025"],
      assuntos: [{ titulo: "Férias", militar: "FULANO DE TAL", pendencias: [], ausentes: [], texto: "ok." }],
    });
    expect(r.bloqueado).toBe(false);
    expect(r.alertas).toBe(1);
  });

  it("bloqueia resíduo técnico no texto oficial", () => {
    const r = auditarPreGeracao({
      ...base,
      assuntos: [{ titulo: "Viagem", militar: "FULANO DE TAL", pendencias: [], ausentes: [], texto: "destino undefined." }],
    });
    expect(r.bloqueado).toBe(true);
  });
});
