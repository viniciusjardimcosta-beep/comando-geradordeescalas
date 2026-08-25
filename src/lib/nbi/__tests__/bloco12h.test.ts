import { describe, it, expect } from "vitest";
import {
  comporSnapshot,
  extrairMetadadosSnapshot,
} from "@/lib/nbi/snapshotMeta";

// Simula o que duplicarNbi grava no snapshot do novo rascunho.
function snapshotDuplicado(origem: string, rascunho: unknown) {
  return {
    rascunho,
    origem_documento_id: origem,
    duplicado_em: "2026-08-25T19:00:00.000Z",
  };
}

describe("Bloco 12H — rastreabilidade do fluxo Duplicar", () => {
  const ORIGEM = "11111111-1111-4111-8111-111111111111";
  const rascunhoOriginal = { numero: "", ano: 2026, assuntos: [{ codigo: "010" }] };

  it("1. duplicar cria origem_documento_id", () => {
    const s = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    expect(s.origem_documento_id).toBe(ORIGEM);
  });

  it("2. duplicar cria duplicado_em", () => {
    const s = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    expect(s.duplicado_em).toBeTruthy();
  });

  it("3. persistir rascunho preserva origem_documento_id", () => {
    const existente = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    const novo = comporSnapshot(existente, { ...rascunhoOriginal, ano: 2026 });
    expect(novo.origem_documento_id).toBe(ORIGEM);
  });

  it("4. persistir rascunho preserva duplicado_em", () => {
    const existente = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    const novo = comporSnapshot(existente, rascunhoOriginal);
    expect(novo.duplicado_em).toBe("2026-08-25T19:00:00.000Z");
  });

  it("5. editar rascunho não perde metadados e grava o conteúdo novo", () => {
    let snap: unknown = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    for (const ano of [2026, 2027, 2028]) {
      snap = comporSnapshot(snap, { ...rascunhoOriginal, ano });
    }
    const final = snap as ReturnType<typeof comporSnapshot>;
    expect(final.origem_documento_id).toBe(ORIGEM);
    expect(final.duplicado_em).toBe("2026-08-25T19:00:00.000Z");
    expect((final.rascunho as { ano: number }).ano).toBe(2028);
  });

  it("6. geração final preserva origem_documento_id", () => {
    // A geração não reescreve o snapshot: lê o último persistido.
    const persistido = comporSnapshot(
      snapshotDuplicado(ORIGEM, rascunhoOriginal),
      rascunhoOriginal,
    );
    expect(persistido.origem_documento_id).toBe(ORIGEM);
  });

  it("7. geração final preserva duplicado_em", () => {
    const persistido = comporSnapshot(
      snapshotDuplicado(ORIGEM, rascunhoOriginal),
      rascunhoOriginal,
    );
    expect(persistido.duplicado_em).toBe("2026-08-25T19:00:00.000Z");
  });

  it("8. original permanece intacta (função pura, sem mutação)", () => {
    const existente = snapshotDuplicado(ORIGEM, rascunhoOriginal);
    const copia = JSON.parse(JSON.stringify(existente));
    comporSnapshot(existente, { ...rascunhoOriginal, ano: 2030 });
    expect(existente).toEqual(copia);
  });

  it("9. o snapshot não carrega número do original", () => {
    const existente = snapshotDuplicado(ORIGEM, { ...rascunhoOriginal, numero: "005" });
    const novo = comporSnapshot(existente, { ...rascunhoOriginal, numero: "" });
    expect((novo.rascunho as { numero: string }).numero).toBe("");
  });

  it("10. duplicação não injeta numeração reservada no snapshot", () => {
    const meta = extrairMetadadosSnapshot(
      snapshotDuplicado(ORIGEM, rascunhoOriginal),
    );
    expect(Object.keys(meta).sort()).toEqual(["duplicado_em", "origem_documento_id"]);
  });

  it("11. rascunho normal (não duplicado) continua funcionando", () => {
    const novo = comporSnapshot({ rascunho: rascunhoOriginal }, rascunhoOriginal);
    expect(novo.rascunho).toEqual(rascunhoOriginal);
    expect(novo.origem_documento_id).toBeUndefined();
    expect(novo.duplicado_em).toBeUndefined();
  });

  it("12. metadados inexistentes não são inventados", () => {
    expect(extrairMetadadosSnapshot(null)).toEqual({});
    expect(extrairMetadadosSnapshot({})).toEqual({});
    expect(extrairMetadadosSnapshot({ origem_documento_id: "" })).toEqual({});
    expect(extrairMetadadosSnapshot({ origem_documento_id: 42 })).toEqual({});
  });

  it("13. conteúdo arbitrário do snapshot antigo não é mesclado", () => {
    const novo = comporSnapshot(
      { rascunho: rascunhoOriginal, lixo: "x", numero_int: 5 },
      rascunhoOriginal,
    );
    expect(Object.keys(novo)).toEqual(["rascunho"]);
  });
});
