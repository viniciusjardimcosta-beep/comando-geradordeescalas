// Bloco 10C — provas do motor de revisão ortográfica.
// Cobrem: pureza, custo (sem travar a thread) e estabilidade estrutural.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { achatar, indexarLexico, conhecida, sugerirPorLexico } from "@/utils/nbi-lexico";

const dicRaw = readFileSync("public/dicionarios/pt/pt.dic", "utf8");
const idx = indexarLexico(dicRaw);

describe("léxico PT — indexação", () => {
  it("indexa o dicionário completo em tempo aceitável (< 5s)", () => {
    const t0 = Date.now();
    const i = indexarLexico(dicRaw);
    const ms = Date.now() - t0;
    expect(i.size).toBeGreaterThan(100_000);
    expect(ms).toBeLessThan(5000);
  });

  it("achatar remove diacríticos e caixa", () => {
    expect(achatar("São")).toBe("sao");
    expect(achatar("MISSÃO")).toBe("missao");
  });
});

describe("sugestões por acentuação", () => {
  it("sugere a forma acentuada preservando a capitalização", () => {
    expect(sugerirPorLexico("Sebastiao", idx)).toBe("Sebastião");
    expect(sugerirPorLexico("missao", idx)).toBe("missão");
  });

  it("não sugere nada para palavras já corretas", () => {
    expect(sugerirPorLexico("missão", idx)).toBeNull();
    expect(sugerirPorLexico("Silva", idx)).toBeNull();
  });

  it("é puro: duas chamadas devolvem o mesmo resultado", () => {
    const a = sugerirPorLexico("ferias", idx);
    const b = sugerirPorLexico("ferias", idx);
    expect(a).toBe(b);
    expect(a).toBe("férias");
  });

  it("reconhece palavras do léxico", () => {
    expect(conhecida("missão", idx)).toBe(true);
    expect(conhecida("xkzqw", idx)).toBe(false);
  });
});
