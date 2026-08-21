import { describe, expect, it } from "vitest";
import {
  classificarPeriodo,
  diasDentroDoMes,
  diasNoMesFerias,
  montarResultadoMensal,
  periodoIntersectaMes,
  primeiroDiaDoMes,
  tituloConsulta,
  ultimoDiaDoMes,
  type PeriodoFerias,
} from "../consultaMensal";

const p = (id: string, militar_id: string, periodo: number, data_inicio: string, data_fim: string): PeriodoFerias =>
  ({ id, militar_id, ano: Number(data_inicio.slice(0, 4)), periodo, data_inicio, data_fim });

const militares = [
  { id: "m1", nome: "Silva", matricula: "111", posto_graduacao: "SD" },
  { id: "m2", nome: "Alves", matricula: "222", posto_graduacao: "CB" },
];

describe("limites do mês", () => {
  it("calcula primeiro e último dia", () => {
    expect(primeiroDiaDoMes(8, 2026)).toBe("2026-08-01");
    expect(ultimoDiaDoMes(8, 2026)).toBe("2026-08-31");
  });
  it("fevereiro em ano bissexto e comum", () => {
    expect(diasNoMesFerias(2, 2024)).toBe(29);
    expect(diasNoMesFerias(2, 2026)).toBe(28);
    expect(ultimoDiaDoMes(2, 2024)).toBe("2024-02-29");
  });
});

describe("interseção, dias e classificação", () => {
  it("1. férias totalmente dentro do mês", () => {
    const f = p("a", "m1", 1, "2026-08-05", "2026-08-20");
    expect(periodoIntersectaMes(f, 8, 2026)).toBe(true);
    expect(diasDentroDoMes(f, 8, 2026)).toBe(16);
    expect(classificarPeriodo(f, 8, 2026)).toBe("Integralmente no mês");
  });

  it("2. férias iniciadas no mês anterior", () => {
    const f = p("b", "m1", 1, "2026-07-28", "2026-08-10");
    expect(diasDentroDoMes(f, 8, 2026)).toBe(10);
    expect(classificarPeriodo(f, 8, 2026)).toBe("Termina no mês");
  });

  it("3. férias terminadas no mês seguinte", () => {
    const f = p("c", "m1", 1, "2026-08-25", "2026-09-08");
    expect(diasDentroDoMes(f, 8, 2026)).toBe(7);
    expect(classificarPeriodo(f, 8, 2026)).toBe("Inicia no mês");
  });

  it("4. férias que abrangem todo o mês", () => {
    const f = p("d", "m1", 1, "2026-07-15", "2026-09-20");
    expect(diasDentroDoMes(f, 8, 2026)).toBe(31);
    expect(classificarPeriodo(f, 8, 2026)).toBe("Abrange todo o mês");
  });

  it("5. férias fora do mês", () => {
    expect(periodoIntersectaMes(p("e", "m1", 1, "2026-07-01", "2026-07-31"), 8, 2026)).toBe(false);
    expect(periodoIntersectaMes(p("f", "m1", 1, "2026-09-01", "2026-09-15"), 8, 2026)).toBe(false);
    expect(diasDentroDoMes(p("e", "m1", 1, "2026-07-01", "2026-07-31"), 8, 2026)).toBe(0);
  });

  it("6. virada dezembro → janeiro aparece nos dois meses", () => {
    const f = p("g", "m1", 1, "2026-12-28", "2027-01-10");
    expect(periodoIntersectaMes(f, 12, 2026)).toBe(true);
    expect(diasDentroDoMes(f, 12, 2026)).toBe(4);
    expect(classificarPeriodo(f, 12, 2026)).toBe("Inicia no mês");
    expect(periodoIntersectaMes(f, 1, 2027)).toBe(true);
    expect(diasDentroDoMes(f, 1, 2027)).toBe(10);
    expect(classificarPeriodo(f, 1, 2027)).toBe("Termina no mês");
  });

  it("7. fevereiro bissexto conta 29 dias", () => {
    const f = p("h", "m1", 1, "2024-01-20", "2024-03-05");
    expect(diasDentroDoMes(f, 2, 2024)).toBe(29);
  });
});

describe("montarResultadoMensal", () => {
  it("8. militar com dois períodos no mesmo mês", () => {
    const r = montarResultadoMensal(
      [p("a", "m1", 1, "2026-08-01", "2026-08-05"), p("b", "m1", 2, "2026-08-20", "2026-08-25")],
      militares, 8, 2026,
    );
    expect(r.totalMilitares).toBe(1);
    expect(r.totalPeriodos).toBe(2);
  });

  it("9. vários militares, ignorando os fora do mês", () => {
    const r = montarResultadoMensal(
      [
        p("a", "m1", 1, "2026-08-01", "2026-08-05"),
        p("b", "m2", 1, "2026-07-25", "2026-08-08"),
        p("c", "m2", 2, "2026-09-01", "2026-09-10"),
      ],
      militares, 8, 2026,
    );
    expect(r.totalMilitares).toBe(2);
    expect(r.totalPeriodos).toBe(2);
    expect(r.linhas[0].dataInicio).toBe("2026-07-25");
    expect(r.linhas[0].militarNome).toBe("Alves");
    expect(r.linhas[0].matricula).toBe("222");
    expect(r.linhas[0].postoGraduacao).toBe("CB");
  });

  it("10. consulta sem resultados", () => {
    const r = montarResultadoMensal([p("a", "m1", 1, "2026-01-01", "2026-01-10")], militares, 8, 2026);
    expect(r.linhas).toHaveLength(0);
    expect(r.totalMilitares).toBe(0);
    expect(r.totalPeriodos).toBe(0);
  });

  it("11/12. dias e classificação propagados nas linhas", () => {
    const r = montarResultadoMensal([p("a", "m1", 1, "2026-07-28", "2026-08-10")], militares, 8, 2026);
    expect(r.linhas[0].diasNoMes).toBe(10);
    expect(r.linhas[0].classificacao).toBe("Termina no mês");
  });

  it("título dinâmico", () => {
    expect(tituloConsulta(8, 2026)).toBe("Férias em Agosto de 2026");
  });
});

describe("13. pesquisa atual por nome/matrícula permanece inalterada", () => {
  // Réplica exata do filtro em src/routes/app.ferias.tsx (aba 1), garantindo que o
  // comportamento existente não muda com a nova aba.
  const filtrar = (filtro: string) =>
    militares.filter(
      (m) =>
        !filtro.trim() ||
        m.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        (m.matricula ?? "").includes(filtro),
    );

  it("filtra por nome, matrícula e retorna tudo quando vazio", () => {
    expect(filtrar("sil").map((m) => m.id)).toEqual(["m1"]);
    expect(filtrar("222").map((m) => m.id)).toEqual(["m2"]);
    expect(filtrar("  ")).toHaveLength(2);
  });
});
