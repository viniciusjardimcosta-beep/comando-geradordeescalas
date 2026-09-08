// BLOCO 14B.2 — PERF-03 (paralelismo em /app/importar) e PERF-06 (dedup de militares em /app/ferias)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MILITARES_OP_COLUMNS, mapMilitaresOp } from "../militaresOp";
import { montarResultadoMensal, type MilitarResumo } from "@/lib/ferias/consultaMensal";

const importar = readFileSync("src/routes/app.importar.tsx", "utf8");
const ferias = readFileSync("src/routes/app.ferias.tsx", "utf8");
const consultaMensal = readFileSync("src/components/ferias/ConsultaMensal.tsx", "utf8");

describe("PERF-03 — /app/importar", () => {
  it("A. histórico e militares são funções independentes", () => {
    expect(importar).toContain("const loadHistorico = async ()");
    expect(importar).toContain("const loadMilitaresOp = async ()");
  });

  it("B. as duas consultas são disparadas em paralelo em um único efeito", () => {
    expect(importar).toContain("Promise.allSettled([loadHistorico(), loadMilitaresOp()])");
    // apenas um efeito de carga inicial
    expect(importar.match(/useEffect\(\(\) => \{\s*void Promise\.allSettled/g)?.length).toBe(1);
    expect(importar).not.toMatch(/useEffect\(\(\) => \{ loadHistorico\(\); \}, \[\]\)/);
  });

  it("C. resultado das consultas continua correto (projeção e regra preservadas)", () => {
    expect(MILITARES_OP_COLUMNS).toContain("tipo_escala");
    const lista = mapMilitaresOp([
      { id: "2", nome: "Beta", matricula: "2", is_cg: true, is_cov: false, is_adm: false, tipo_escala: "24h", ativo: true },
      { id: "1", nome: "Alfa", matricula: "1", is_cg: false, is_cov: true, is_adm: false, tipo_escala: null, ativo: true },
      { id: "3", nome: "ADM", matricula: "3", is_adm: true, tipo_escala: "24h", ativo: true },
      { id: "4", nome: "Exp", matricula: "4", is_adm: false, tipo_escala: "expediente", ativo: true },
    ]);
    expect(lista.map((m) => m.id)).toEqual(["1", "2"]);
    expect(lista[0]).toEqual({ id: "1", nome: "Alfa", matricula: "1", is_cg: false, is_cov: true });
  });

  it("D. erro de uma consulta é tratado isoladamente", () => {
    expect(importar).toContain("setErroHist");
    expect(importar).toContain("setErroMilitares");
    expect(importar).toContain("setMilitaresOp([]);");
  });

  it("E. loading sempre termina (finally)", () => {
    const finallies = importar.match(/finally \{\s*setLoading(Hist|Militares)\(false\);/g) ?? [];
    expect(finallies.length).toBe(2);
  });

  it("F. refresh do histórico após geração continua existindo", () => {
    expect(importar).toMatch(/loadHistorico\(\)/);
    expect(importar).toContain("setDetalhes({});");
  });

  it("G. geração de escala não foi alterada", () => {
    expect(importar).toContain("gerarEscala");
    expect(importar).toContain("parametros: { militaresPorDia, minCovPorDia, minCgPorDia, observacoesTexto, modo }");
  });
});

describe("PERF-06 — Banco de Férias", () => {
  it("A. app.ferias carrega militares uma única vez", () => {
    expect(ferias.match(/from\("militares"\)/g)?.length).toBe(1);
    expect(ferias).toContain('select("id, nome, matricula, posto_graduacao, is_adm, ativo")');
  });

  it("B. ConsultaMensal recebe os militares do pai", () => {
    expect(ferias).toContain("<ConsultaMensal userId={user?.id} militares={militares} militaresLoading={loading} />");
    expect(consultaMensal).toContain("militares: MilitarResumo[];");
  });

  it("C. ConsultaMensal não consulta mais a tabela militares", () => {
    expect(consultaMensal).not.toContain('from("militares")');
    expect(consultaMensal.match(/supabase\s*\.from\(/g)?.length).toBe(1);
  });

  it("D. a consulta mensal de férias continua sendo executada com a regra homologada", () => {
    expect(consultaMensal).toContain('from("ferias_militares")');
    expect(consultaMensal).toContain('.lte("data_inicio", ultimoDiaDoMes(mes, ano))');
    expect(consultaMensal).toContain('.gte("data_fim", primeiroDiaDoMes(mes, ano))');
  });

  it("E. resultados mensais permanecem iguais", () => {
    const militares: MilitarResumo[] = [
      { id: "m1", nome: "Alfa", matricula: "1", posto_graduacao: "SD" },
      { id: "m2", nome: "Beta", matricula: "2", posto_graduacao: "CB" },
    ];
    const periodos = [
      { id: "p1", militar_id: "m1", ano: 2026, periodo: 1, data_inicio: "2026-03-10", data_fim: "2026-03-20" },
      { id: "p2", militar_id: "m2", ano: 2026, periodo: 1, data_inicio: "2026-02-25", data_fim: "2026-03-05" },
      { id: "p3", militar_id: "m2", ano: 2026, periodo: 2, data_inicio: "2026-05-01", data_fim: "2026-05-10" },
    ];
    const r = montarResultadoMensal(periodos, militares, 3, 2026);
    expect(r.totalPeriodos).toBe(2);
    expect(r.totalMilitares).toBe(2);
    expect(r.linhas.map((l) => l.id)).toEqual(["p2", "p1"]);
    expect(r.linhas[0].classificacao).toBe("Termina no mês");
  });

  it("F. listagem principal continua restrita a militares ativos", () => {
    expect(ferias).toContain("militares.filter((m) => m.ativo !== false)");
    expect(ferias).toContain("militaresAtivos.filter");
  });
});
