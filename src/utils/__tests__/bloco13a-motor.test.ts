/**
 * BLOCO 13A — Rede de segurança (regressão) do motor de escalas.
 *
 * Estes testes REGISTRAM o comportamento oficial ATUAL do motor.
 * Nenhuma regra nova é inventada e o motor não é alterado.
 * Todos os dados são FICTÍCIOS (FULANO / BELTRANO / SICRANO ...).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diasCom, linha, militar, motor, resetRows, rodar, type MilitarFake } from "./escalaHarness";

const MES = 9;
const ANO = 2026; // setembro/2026: 30 dias
const DIAS = 30;

const horasOrd: Record<string, number> = {
  "1": 6, "2": 6, "3": 6, "4": 6,
  "12": 12, "13": 12, "14": 12, "23": 12, "24": 12, "34": 12,
  "123": 18, "124": 18, "134": 18, "234": 18,
  "1234": 24, "2341": 24,
};
const num = (s: string, re: RegExp) => {
  const m = re.exec(s ?? "");
  return m ? Number(m[1]) : 0;
};

function guarnicao(): MilitarFake[] {
  return [
    militar({ nome: "FULANO DE TAL", matricula: "0000001", posto: "1º Sargento QPBM", postoCat: "sgt", isCg: true }),
    militar({ nome: "BELTRANO DE TAL", matricula: "0000002", posto: "2º Sargento QPBM", postoCat: "sgt", isCg: true }),
    militar({ nome: "SICRANO DE TAL", matricula: "0000003", posto: "Cabo QPBM", postoCat: "cb", isCov: true }),
    militar({ nome: "AURELIANO DE TAL", matricula: "0000004", posto: "Soldado QPBM", isCov: true }),
    militar({ nome: "EPAMINONDAS DE TAL", matricula: "0000005", posto: "Soldado QPBM" }),
    militar({ nome: "TIBURCIO DE TAL", matricula: "0000006", posto: "Soldado QPBM", isCov: true }),
    militar({ nome: "CANDIDO DE TAL", matricula: "0000007", posto: "Soldado QPBM", isCg: true }),
    militar({ nome: "ZACARIAS DE TAL", matricula: "0000008", posto: "Soldado QPBM", isCov: true }),
  ];
}

beforeEach(() => resetRows());

/* ================================================================== */
/* 1. Helpers de calendário (feriados / expediente / dias do mês)     */
/* ================================================================== */
describe("calendário institucional", () => {
  it("dias do mês, fevereiro bissexto e comum", () => {
    expect(motor.diasNoMes(9, 2026)).toBe(30);
    expect(motor.diasNoMes(2, 2024)).toBe(29);
    expect(motor.diasNoMes(2, 2026)).toBe(28);
  });

  it("feriados nacionais fixos e móveis", () => {
    expect(motor.isFeriado(2026, 9, 7)).toBe(true); // Independência
    expect(motor.isFeriado(2026, 12, 25)).toBe(true);
    expect(motor.isFeriado(2026, 4, 3)).toBe(true); // Sexta-feira Santa 2026
    expect(motor.isFeriado(2026, 9, 8)).toBe(false);
  });

  it("dia de expediente = seg-sex sem feriado", () => {
    expect(motor.isDiaExpediente(2026, 9, 7)).toBe(false); // feriado (segunda)
    expect(motor.isDiaExpediente(2026, 9, 8)).toBe(true); // terça
    expect(motor.isDiaExpediente(2026, 9, 5)).toBe(false); // sábado
    expect(motor.isDiaExpediente(2026, 9, 6)).toBe(false); // domingo
    expect(motor.rotuloSemana(2026, 9, 5)).toBe("sáb.");
  });

  it("classificação de posto para limites de HE", () => {
    expect(motor.classificarPosto("1º Sargento QPBM")).toBe("sgt");
    expect(motor.classificarPosto("Cabo QPBM")).toBe("cb");
    expect(motor.classificarPosto("Soldado QPBM")).toBe("sd");
    expect(motor.classificarPosto("1º Tenente QOBM")).toBe("ten");
    expect(motor.classificarPosto("Servidor Civil")).toBe("outro");
  });
});

/* ================================================================== */
/* 2. Ciclo 24x72 / ORD / folga mínima                                */
/* ================================================================== */
describe("ciclo 24x72 e linha do tempo do serviço", () => {
  it("serviço 24h é gravado como 234 em D e 1 em D+1 (nunca 2341 numa célula)", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    let servicos = 0;
    for (const m of ms) {
      const l = linha(r.ord, m, DIAS);
      l.forEach((s, i) => {
        expect(s).not.toBe("2341");
        expect(s).not.toBe("1234");
        if (s === "234") {
          servicos++;
          if (i + 1 < DIAS) expect(l[i + 1]).toBe("1");
        }
      });
    }
    expect(servicos).toBeGreaterThan(0);
  });

  it("folga mínima: nenhum militar inicia serviço em dias consecutivos", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    for (const m of ms) {
      const inicios = diasCom(r.ord, m, DIAS, "234");
      for (let i = 1; i < inicios.length; i++) {
        expect(inicios[i] - inicios[i - 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("efetivo alvo por dia é respeitado quando há militares disponíveis", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO, par: { militaresPorDia: 2, minCgPorDia: 1, minCovPorDia: 1 } });
    for (let d = 1; d <= DIAS; d++) {
      const inicios = ms.filter((m) => r.ord.get(d)?.get(m.rowOrd) === "234").length;
      expect(inicios).toBeLessThanOrEqual(2);
    }
  });

  it("militar de escala parcial nunca entra no ciclo 24h", () => {
    const ms = guarnicao();
    ms.push(militar({ nome: "PARCIAL DE TAL", matricula: "0000009", tipoEscala: "parcial" }));
    const parcial = ms[ms.length - 1];
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    expect(diasCom(r.ord, parcial, DIAS, "234")).toEqual([]);
  });

  it("militar inativo não é escalado", () => {
    const ms = guarnicao();
    ms.push(militar({ nome: "INATIVO DE TAL", matricula: "0000010", ativo: false }));
    const inativo = ms[ms.length - 1];
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    expect(diasCom(r.ord, inativo, DIAS, "234")).toEqual([]);
  });
});

/* ================================================================== */
/* 3. CG / COV                                                        */
/* ================================================================== */
describe("CG e COV", () => {
  it("exceção somente_cg impede escalar militar sem função CG naquele dia", () => {
    const ms = guarnicao();
    const alvo = ms.find((m) => !m.isCg)!;
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { excecoes: [{ matricula: alvo.matricula, dias: [3, 4, 5], acao: "somente_cg" }] },
    });
    for (const d of [3, 4, 5]) expect(r.ord.get(d)?.get(alvo.rowOrd)).not.toBe("234");
  });

  it("guarnição sem COV registra furo/alerta e não trava o motor", () => {
    const ms = [
      militar({ nome: "FULANO DE TAL", matricula: "0000001", isCg: true }),
      militar({ nome: "BELTRANO DE TAL", matricula: "0000002", isCg: true }),
    ];
    const r = rodar({ militares: ms, mes: MES, ano: ANO, par: { militaresPorDia: 4, minCovPorDia: 1, minCgPorDia: 1 } });
    expect(r.furos.length).toBeGreaterThan(0);
    expect(r.furos.every((f) => f.faltantes > 0)).toBe(true);
  });
});

/* ================================================================== */
/* 4. Afastamentos / FER / LTS / LAA                                  */
/* ================================================================== */
describe("afastamentos e SIGLAS_AFASTAMENTO", () => {
  it("FER é gravado exatamente nos dias do período e não há ORD operacional neles", () => {
    const ms = guarnicao();
    const alvo = ms[0];
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: alvo.matricula, diaInicio: 10, diaFim: 20, sigla: "FER" }] },
    });
    for (let d = 10; d <= 20; d++) expect(r.ord.get(d)?.get(alvo.rowOrd)).toBe("FER");
    expect(r.ord.get(9)?.get(alvo.rowOrd) ?? "").not.toBe("FER");
    expect(r.ord.get(21)?.get(alvo.rowOrd) ?? "").not.toBe("FER");
  });

  it("LTS e LAA são preservadas na linha ORD", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: {
        afastamentos: [
          { matricula: ms[1].matricula, diaInicio: 2, diaFim: 4, sigla: "LTS" },
          { matricula: ms[2].matricula, diaInicio: 6, diaFim: 6, sigla: "LAA" },
        ],
      },
    });
    expect(linha(r.ord, ms[1], DIAS).slice(1, 4)).toEqual(["LTS", "LTS", "LTS"]);
    expect(r.ord.get(6)?.get(ms[2].rowOrd)).toBe("LAA");
  });

  it("sigla ausente é inferida pelo motivo (férias→FER, saúde→LTS, luto→LNJ)", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: {
        afastamentos: [
          { matricula: ms[0].matricula, diaInicio: 3, diaFim: 3, motivo: "férias regulamentares" },
          { matricula: ms[1].matricula, diaInicio: 3, diaFim: 3, motivo: "licença para tratamento de saúde" },
          { matricula: ms[2].matricula, diaInicio: 3, diaFim: 3, motivo: "luto" },
        ],
      },
    });
    expect(r.ord.get(3)?.get(ms[0].rowOrd)).toBe("FER");
    expect(r.ord.get(3)?.get(ms[1].rowOrd)).toBe("LTS");
    expect(r.ord.get(3)?.get(ms[2].rowOrd)).toBe("LNJ");
  });

  it("férias iniciando antes do mês são recortadas a partir do dia 1", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: -5, diaFim: 6, sigla: "FER" }] },
    });
    for (let d = 1; d <= 6; d++) expect(r.ord.get(d)?.get(ms[0].rowOrd)).toBe("FER");
  });

  it("férias terminando depois do mês são recortadas no último dia", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: 25, diaFim: 45, sigla: "FER" }] },
    });
    for (let d = 25; d <= DIAS; d++) expect(r.ord.get(d)?.get(ms[0].rowOrd)).toBe("FER");
  });

  it("virada de ano: dezembro recebe apenas a parte do próprio mês", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: 12, ano: 2026,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: 28, diaFim: 40, sigla: "FER" }] },
    });
    expect(diasCom(r.ord, ms[0], 31, "FER")).toEqual([28, 29, 30, 31]);
  });

  it("militar afastado não recebe serviço ordinário nos dias de afastamento", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: 1, diaFim: DIAS, sigla: "FER" }] },
    });
    expect(diasCom(r.ord, ms[0], DIAS, "234")).toEqual([]);
    expect(diasCom(r.ord, ms[0], DIAS, "1")).toEqual([]);
  });

  it("afastamento de militar inexistente gera alerta e é ignorado", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: "9999999", nome: "NAO CADASTRADO", diaInicio: 1, diaFim: 3, sigla: "FER" }] },
    });
    expect(r.alertas.some((a) => a.tipo === "warn" && /não encontrado/i.test(a.msg))).toBe(true);
  });
});

/* ================================================================== */
/* 5. REGRESSÃO REAL — FER em militar ADM                             */
/* ================================================================== */
describe("REGRESSÃO REAL: FER preservado em militar ADM", () => {
  it("ADM com férias 21–28: FER exatamente nesses dias, sem código operacional e sem EXP/HE no período", () => {
    const ms = guarnicao();
    const adm = militar({ nome: "SICRANO DE TAL", matricula: "0000099", posto: "1º Sargento QPBM", postoCat: "sgt", isAdm: true });
    ms.push(adm);
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: adm.matricula, diaInicio: 21, diaFim: 28, sigla: "FER" }] },
    });

    // FER exatamente nos dias 21–28 (o saneamento ADM não remove SIGLAS_AFASTAMENTO)
    expect(diasCom(r.ord, adm, DIAS, "FER")).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);

    // nenhum código operacional em ORD no período nem fora dele
    const l = linha(r.ord, adm, DIAS);
    for (const s of l) {
      if (!s) continue;
      expect(motor.SIGLAS_AFASTAMENTO.has(s)).toBe(true);
    }

    // sem EXP e sem HE durante o afastamento
    for (let d = 21; d <= 28; d++) {
      expect(r.exp.get(d)?.get(adm.rowOrd) ?? "").toBe("");
      expect(r.he.get(d)?.get(adm.rowOrd) ?? "").toBe("");
    }
  });

  it("saneamento ADM continua removendo código operacional lançado manualmente", () => {
    const ms = guarnicao();
    const adm = militar({ nome: "BELTRANO DE TAL", matricula: "0000098", isAdm: true });
    ms.push(adm);
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { lancamentos: [{ matricula: adm.matricula, dias: [8], linha: "ORD", sigla: "234" }] },
    });
    expect(r.ord.get(8)?.get(adm.rowOrd) ?? "").toBe("");
    expect(r.alertas.some((a) => /ADM/.test(a.msg))).toBe(true);
  });

  it("ADM nunca recebe EXP nem HE em sábado, domingo ou feriado", () => {
    const ms = guarnicao();
    const adm = militar({ nome: "FULANO DE TAL", matricula: "0000097", isAdm: true });
    ms.push(adm);
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    for (let d = 1; d <= DIAS; d++) {
      if (motor.isDiaExpediente(ANO, MES, d)) continue;
      expect(r.exp.get(d)?.get(adm.rowOrd) ?? "").toBe("");
      expect(r.he.get(d)?.get(adm.rowOrd) ?? "").toBe("");
    }
  });

  it("ADM nunca entra no ciclo operacional 24x72", () => {
    const ms = guarnicao();
    const adm = militar({ nome: "CANDIDO DE TAL", matricula: "0000096", isAdm: true });
    ms.push(adm);
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    expect(diasCom(r.ord, adm, DIAS, "234")).toEqual([]);
    expect(diasCom(r.ord, adm, DIAS, "1")).toEqual([]);
  });
});

/* ================================================================== */
/* 6. Lançamentos diretos (ORD / EXP / CM / HE)                       */
/* ================================================================== */
describe("lançamentos diretos", () => {
  it("2341 é desdobrado em 234 (D) + 1 (D+1)", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { lancamentos: [{ matricula: ms[0].matricula, dias: [4], linha: "ORD", sigla: "2341" }] },
    });
    expect(r.ord.get(4)?.get(ms[0].rowOrd)).toBe("234");
    expect(r.ord.get(5)?.get(ms[0].rowOrd)).toBe("1");
  });

  it("HE24 é desdobrada em HE16 (D) + HE8 (D+1)", () => {
    // Militar fora do ciclo 24h (escala parcial) para isolar a regra do
    // desdobramento — em militar operacional as etapas posteriores de limite
    // diário/carga ajustam as horas do dia.
    const parcial = militar({ nome: "PARCIAL DE TAL", matricula: "0000091", tipoEscala: "parcial" });
    const ms = [...guarnicao(), parcial];
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { lancamentos: [{ matricula: parcial.matricula, dias: [9], linha: "HE", sigla: "HE24" }] },
    });
    expect(r.he.get(9)?.get(parcial.rowOrd)).toBe("HE16");
    expect(r.he.get(10)?.get(parcial.rowOrd)).toBe("HE8");
  });


  it("EXP6 e EXP9 são aceitos na linha EXP", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: {
        lancamentos: [
          { matricula: ms[0].matricula, dias: [8], linha: "EXP", sigla: "EXP6" },
          { matricula: ms[1].matricula, dias: [8], linha: "EXP", sigla: "EXP9" },
        ],
      },
    });
    expect(r.exp.get(8)?.get(ms[0].rowOrd)).toBe("EXP6");
    expect(r.exp.get(8)?.get(ms[1].rowOrd)).toBe("EXP9");
  });

  it("sigla fora do glossário é ignorada com alerta", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { lancamentos: [{ matricula: ms[0].matricula, dias: [8], linha: "EXP", sigla: "EXP99" }] },
    });
    expect(r.exp.get(8)?.get(ms[0].rowOrd) ?? "").toBe("");
    expect(r.alertas.some((a) => a.tipo === "warn" && /fora do glossário/i.test(a.msg))).toBe(true);
  });

  it("glossários: EXP1..EXP12, CM1..CM16, HE1..HE24", () => {
    expect(motor.SIGLAS_COMP_VALIDAS.has("EXP12")).toBe(true);
    expect(motor.SIGLAS_COMP_VALIDAS.has("EXP13")).toBe(false);
    expect(motor.SIGLAS_COMP_VALIDAS.has("CM16")).toBe(true);
    expect(motor.SIGLAS_HE_VALIDAS.has("HE24")).toBe(true);
    expect(motor.SIGLAS_HE_VALIDAS.has("HE25")).toBe(false);
  });
});

/* ================================================================== */
/* 7. Indisponibilidades / obrigatoriedade / reforço                  */
/* ================================================================== */
describe("indisponibilidades e reforços", () => {
  it("nao_escalar impede serviço nos dias indicados", () => {
    const ms = guarnicao();
    const alvo = ms[3];
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { excecoes: [{ matricula: alvo.matricula, dias: [10, 11, 12], acao: "nao_escalar" }] },
    });
    for (const d of [10, 11, 12]) expect(r.ord.get(d)?.get(alvo.rowOrd) ?? "").not.toBe("234");
  });

  it("reforço aumenta o alvo do dia", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      par: { militaresPorDia: 2 },
      ia: { reforcos: [{ dia: 15, militaresPorDia: 4 }] },
    });
    const inicios = ms.filter((m) => r.ord.get(15)?.get(m.rowOrd) === "234").length;
    expect(inicios).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== */
/* 8. Carga horária, HE e limites                                     */
/* ================================================================== */
describe("carga horária, HE e limites institucionais", () => {
  it("nunca existe HE acima de HE16 numa célula", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    for (const m of ms) {
      for (const s of linha(r.he, m, DIAS)) {
        if (!s) continue;
        expect(num(s, /^HE(\d{1,2})$/)).toBeLessThanOrEqual(16);
      }
    }
  });

  it("total diário ≤ 16h, exceto quando o dia tem ORD 234 (18h)", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    for (const m of ms) {
      for (let d = 1; d <= DIAS; d++) {
        const sOrd = r.ord.get(d)?.get(m.rowOrd) ?? "";
        if (motor.SIGLAS_AFASTAMENTO.has(sOrd)) continue;
        const total =
          (horasOrd[sOrd] ?? 0) +
          num(r.exp.get(d)?.get(m.rowOrd) ?? "", /^(?:EXP|CM|TELE)(\d{1,2})$/) +
          num(r.he.get(d)?.get(m.rowOrd) ?? "", /^HE(\d{1,2})$/);
        expect(total).toBeLessThanOrEqual(sOrd === "234" ? 18 : 16);
      }
    }
  });

  it("limite de HE por militar é respeitado", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { limitesHe: [{ matricula: ms[0].matricula, maxHoras: 12 }] },
    });
    let totalHe = 0;
    for (const s of linha(r.he, ms[0], DIAS)) totalHe += num(s, /^HE(\d{1,2})$/);
    expect(totalHe).toBeLessThanOrEqual(12);
  });

  it("limite de HE por posto/papel é respeitado", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { limitesHe: [{ postoOuPapel: "sgt", maxHoras: 6 }] },
    });
    for (const m of ms.filter((x) => x.postoCat === "sgt")) {
      let t = 0;
      for (const s of linha(r.he, m, DIAS)) t += num(s, /^HE(\d{1,2})$/);
      expect(t).toBeLessThanOrEqual(6);
    }
  });

  it("carga ordinária mensal não excede o teto do mês (30 dias = 171h)", () => {
    const ms = guarnicao();
    const r = rodar({ militares: ms, mes: MES, ano: ANO });
    for (const m of ms) {
      let ordH = 0;
      for (const s of linha(r.ord, m, DIAS)) {
        if (motor.SIGLAS_AFASTAMENTO.has(s)) continue;
        ordH += horasOrd[s] ?? 0;
      }
      let compH = 0;
      for (const s of linha(r.exp, m, DIAS)) compH += num(s, /^(?:EXP|CM|TELE)(\d{1,2})$/);
      expect(ordH + compH).toBeLessThanOrEqual(171);
    }
  });

  it("afastamento reduz proporcionalmente o teto de horas ordinárias", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: 1, diaFim: 15, sigla: "FER" }] },
    });
    let ordH = 0;
    for (const s of linha(r.ord, ms[0], DIAS)) {
      if (motor.SIGLAS_AFASTAMENTO.has(s)) continue;
      ordH += horasOrd[s] ?? 0;
    }
    let compH = 0;
    for (const s of linha(r.exp, ms[0], DIAS)) compH += num(s, /^(?:EXP|CM|TELE)(\d{1,2})$/);
    expect(ordH + compH).toBeLessThanOrEqual(Math.round(171 * 0.5) + 6);
  });

  it("nenhum lançamento de EXP/HE durante afastamento", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { afastamentos: [{ matricula: ms[0].matricula, diaInicio: 5, diaFim: 12, sigla: "LTS" }] },
    });
    for (let d = 5; d <= 12; d++) {
      expect(r.exp.get(d)?.get(ms[0].rowOrd) ?? "").toBe("");
      expect(r.he.get(d)?.get(ms[0].rowOrd) ?? "").toBe("");
    }
  });
});

/* ================================================================== */
/* 9. Modo somente ordinária                                          */
/* ================================================================== */
describe("modo ordinario_puro", () => {
  it("não lança HE e registra furos em vez de tapá-los", () => {
    const ms = guarnicao().slice(0, 3);
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      par: { modo: "ordinario_puro", militaresPorDia: 4 },
    });
    for (const m of ms) {
      for (const s of linha(r.he, m, DIAS)) expect(s).toBe("");
    }
    expect(r.furos.length).toBeGreaterThan(0);
  });

  it("no modo auto o motor tenta cobrir os dias (HE permitida)", () => {
    const ms = guarnicao().slice(0, 3);
    const r = rodar({ militares: ms, mes: MES, ano: ANO, par: { modo: "auto", militaresPorDia: 4 } });
    const algumaHe = ms.some((m) => linha(r.he, m, DIAS).some((s) => !!s));
    expect(algumaHe).toBe(true);
  });
});

/* ================================================================== */
/* 10. Virada do mês anterior                                         */
/* ================================================================== */
describe("virada do mês anterior", () => {
  it("tipo ord: dia 1 recebe ORD 1 + CM2 e bloqueia novo serviço nos dias 1 e 2", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { viradaAnterior: [{ matricula: ms[0].matricula, tipo: "ord" }] },
    });
    expect(r.ord.get(1)?.get(ms[0].rowOrd)).toBe("1");
    expect(r.exp.get(1)?.get(ms[0].rowOrd)).toBe("CM2");
    expect(r.ord.get(2)?.get(ms[0].rowOrd) ?? "").not.toBe("234");
  });

  it("tipo he: dia 1 recebe HE8", () => {
    const ms = guarnicao();
    const r = rodar({
      militares: ms, mes: MES, ano: ANO,
      ia: { viradaAnterior: [{ matricula: ms[1].matricula, tipo: "he" }] },
    });
    expect(r.he.get(1)?.get(ms[1].rowOrd)).toBe("HE8");
  });
});

/* ================================================================== */
/* 11. Robustez                                                       */
/* ================================================================== */
describe("robustez do motor", () => {
  it("efetivo vazio não lança exceção", () => {
    expect(() => rodar({ militares: [], mes: MES, ano: ANO })).not.toThrow();
  });

  it("mês de 31 dias com efetivo mínimo termina sem loop infinito", () => {
    const ms = guarnicao().slice(0, 2);
    const r = rodar({ militares: ms, mes: 12, ano: 2026, par: { militaresPorDia: 4 } });
    expect(r.ord.size).toBe(31);
  });

  it("normalizações de matrícula e nome", () => {
    expect(motor.normMatricula("00.000-01")).toBe("0000001");
    expect(motor.normNome("FULANO DE TÁL ")).toBe("fulano de tal");
  });
});
