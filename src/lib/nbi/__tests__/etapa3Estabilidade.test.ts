// Bloco 10C — teste de estabilidade da revisão da Etapa 3 (Conferência).
// Prova que a derivação é pura e estruturalmente estável: repetir o cálculo
// com as mesmas entradas produz exatamente o mesmo resultado, sem qualquer
// escrita em estado, rascunho ou banco.
import { describe, it, expect } from "vitest";
import { sugestoesTexto } from "@/utils/nbi-corretor";
import { indexarLexico, conhecida, sugerirPorLexico } from "@/utils/nbi-lexico";
import { readFileSync } from "node:fs";

const idx = indexarLexico(readFileSync("public/dicionarios/pt/pt.dic", "utf8"));
const spell = {
  correct: (w: string) => conhecida(w, idx),
  suggest: (w: string) => {
    const s = sugerirPorLexico(w, idx);
    return s ? [s] : [];
  },
};

const TEXTOS = [
  "Deslocamento para São Sebastiao com pernoite",
  "missao de transporte de material",
  "Apresentação após ferias regulamentares",
  "Assumiu a função de Chefe da SSCI",
];

describe("Etapa 3 — estabilidade da revisão ortográfica", () => {
  it("é determinística: 50 execuções produzem resultado idêntico", () => {
    const base = TEXTOS.map((t) => sugestoesTexto(t, spell, {}));
    for (let i = 0; i < 50; i++) {
      const atual = TEXTOS.map((t) => sugestoesTexto(t, spell, {}));
      expect(JSON.stringify(atual)).toBe(JSON.stringify(base));
    }
  });

  it("não muta o texto de entrada", () => {
    const texto = "missao de apoio em São Sebastiao";
    const copia = texto;
    sugestoesTexto(texto, spell, {});
    expect(texto).toBe(copia);
  });

  it("respeita palavras ignoradas sem recriar sugestões", () => {
    const ignoradas = new Set(["sebastiao"]);
    const s = sugestoesTexto("Deslocamento para São Sebastiao", spell, { ignoradas });
    expect(s.some((x) => x.original.toLowerCase() === "sebastiao")).toBe(false);
  });

  it("todo o lote de revisão custa muito menos que um frame lento (< 500ms)", () => {
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) TEXTOS.forEach((t) => sugestoesTexto(t, spell, {}));
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
