import { beforeEach, describe, expect, it } from "vitest";
import { diasCom, linha, militar, resetRows, rodar, type MilitarFake } from "./escalaHarness";

const MES = 9;
const ANO = 2026;
const DIAS = 30;

function composicaoManual(quantidadeExternos = 1): { militares: MilitarFake[]; externos: MilitarFake[] } {
  const militares: MilitarFake[] = [];
  let matricula = 1;
  for (let grupo = 1; grupo <= 4; grupo++) {
    militares.push(
      militar({
        nome: `COMANDANTE FICTÍCIO ${grupo}`,
        matricula: String(matricula++).padStart(7, "0"),
        grupoOrdem: grupo,
        isCg: true,
      }),
      militar({
        nome: `CONDUTOR FICTÍCIO ${grupo}`,
        matricula: String(matricula++).padStart(7, "0"),
        grupoOrdem: grupo,
        isCov: true,
      }),
      militar({
        nome: `OPERACIONAL FICTÍCIO ${grupo} A`,
        matricula: String(matricula++).padStart(7, "0"),
        grupoOrdem: grupo,
      }),
      militar({
        nome: `OPERACIONAL FICTÍCIO ${grupo} B`,
        matricula: String(matricula++).padStart(7, "0"),
        grupoOrdem: grupo,
      }),
    );
  }
  const externos = Array.from({ length: quantidadeExternos }, (_, indice) =>
    militar({
      nome: `EXTERNO FICTÍCIO ${indice + 1}`,
      matricula: String(matricula++).padStart(7, "0"),
    }),
  );
  return { militares: [...militares, ...externos], externos };
}

const temSigla = (m: MilitarFake, mapa: Map<number, Map<number, string>>, prefixo: RegExp) =>
  linha(mapa, m, DIAS).some((sigla) => prefixo.test(sigla));

beforeEach(() => resetRows());

describe("composição ORD manual — militar disponível fora das guarnições", () => {
  it("1. bloqueia ORD e CM do 17º militar, preserva HE e emite aviso", () => {
    const { militares, externos } = composicaoManual(1);
    militares[0].afastDias.add(1);
    const externo = externos[0];
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: militares[0].matricula, diaInicio: 1, diaFim: 1, sigla: "LTS" }] },
    });

    expect(diasCom(r.ord, externo, DIAS, "234")).toEqual([]);
    expect(temSigla(externo, r.exp, /^CM/)).toBe(false);
    expect(temSigla(externo, r.he, /^HE/)).toBe(true);
    expect(r.alertas.some((a) => a.tipo === "info" && a.msg.includes(externo.nome))).toBe(true);
  });

  it("2. mantém dois militares externos fora de ORD/CM e lista ambos em um único aviso", () => {
    const { militares, externos } = composicaoManual(2);
    const r = rodar({ militares, mes: MES, ano: ANO, temComposicaoOrdManual: true });
    for (const externo of externos) {
      expect(diasCom(r.ord, externo, DIAS, "234")).toEqual([]);
      expect(temSigla(externo, r.exp, /^CM/)).toBe(false);
    }
    const avisos = r.alertas.filter((a) => a.tipo === "info" && /fora da composição ordinária manual/i.test(a.msg));
    expect(avisos).toHaveLength(1);
    expect(avisos[0].msg).toContain(externos[0].nome);
    expect(avisos[0].msg).toContain(externos[1].nome);
  });

  it("3. afastamento reduz guarnição sem promover o externo e o furo segue pelo mecanismo atual", () => {
    const { militares, externos } = composicaoManual(1);
    const afastado = militares[2];
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      par: { modo: "ordinario_puro" },
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: afastado.matricula, diaInicio: 1, diaFim: 1, sigla: "LTS" }] },
    });
    expect(r.ord.get(1)?.get(externos[0].rowOrd) ?? "").not.toBe("234");
    expect(r.furos.some((f) => f.dia === 1 && f.faltantes > 0)).toBe(true);
  });

  it("4. perda de CG não transforma CG externo em substituto ORD", () => {
    const { militares, externos } = composicaoManual(1);
    externos[0].isCg = true;
    const cgGrupo1 = militares.find((m) => m.grupoOrdem === 1 && m.isCg);
    expect(cgGrupo1).toBeDefined();
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      par: { modo: "ordinario_puro" },
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: cgGrupo1?.matricula, diaInicio: 1, diaFim: 1, sigla: "LTS" }] },
    });
    expect(r.ord.get(1)?.get(externos[0].rowOrd) ?? "").not.toBe("234");
    expect(r.furos.some((f) => f.dia === 1 && f.cg === 0)).toBe(true);
  });

  it("5. perda de COV não transforma COV externo em substituto ORD", () => {
    const { militares, externos } = composicaoManual(1);
    externos[0].isCov = true;
    const covGrupo1 = militares.find((m) => m.grupoOrdem === 1 && m.isCov);
    expect(covGrupo1).toBeDefined();
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      par: { modo: "ordinario_puro" },
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: covGrupo1?.matricula, diaInicio: 1, diaFim: 1, sigla: "LTS" }] },
    });
    expect(r.ord.get(1)?.get(externos[0].rowOrd) ?? "").not.toBe("234");
    expect(r.furos.some((f) => f.dia === 1 && f.cov === 0)).toBe(true);
  });

  it("6. não emite novo aviso quando todos estão incluídos manualmente", () => {
    const { militares } = composicaoManual(0);
    const r = rodar({ militares, mes: MES, ano: ANO, temComposicaoOrdManual: true });
    expect(r.alertas.some((a) => /fora da composição ordinária manual/i.test(a.msg))).toBe(false);
  });

  it("7. sem composição manual preserva fallback ORD, CM e ausência do novo aviso", () => {
    const militares = Array.from({ length: 8 }, (_, indice) =>
      militar({
        nome: `AUTOMÁTICO FICTÍCIO ${indice + 1}`,
        matricula: String(indice + 1).padStart(7, "0"),
        isCg: indice < 2,
        isCov: indice >= 2 && indice < 4,
      }),
    );
    const r = rodar({ militares, mes: MES, ano: ANO });
    expect(militares.some((m) => diasCom(r.ord, m, DIAS, "234").length > 0)).toBe(true);
    expect(militares.some((m) => temSigla(m, r.exp, /^CM/))).toBe(true);
    expect(r.alertas.some((a) => /fora da composição ordinária manual/i.test(a.msg))).toBe(false);
  });

  it("8. externo continua elegível para HE/tapa-furo sem ganhar ORD", () => {
    const { militares, externos } = composicaoManual(1);
    const membro = militares[3];
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: membro.matricula, diaInicio: 1, diaFim: 1, sigla: "LAA" }] },
    });
    expect(temSigla(externos[0], r.he, /^HE/)).toBe(true);
    expect(diasCom(r.ord, externos[0], DIAS, "234")).toEqual([]);
  });

  it("9. afastamento do externo permanece na ORD informativa, sem ORD operacional ou CM", () => {
    const { militares, externos } = composicaoManual(1);
    const externo = externos[0];
    const r = rodar({
      militares,
      mes: MES,
      ano: ANO,
      temComposicaoOrdManual: true,
      ia: { afastamentos: [{ matricula: externo.matricula, diaInicio: 10, diaFim: 12, sigla: "FER" }] },
    });
    expect(diasCom(r.ord, externo, DIAS, "FER")).toEqual([10, 11, 12]);
    expect(diasCom(r.ord, externo, DIAS, "234")).toEqual([]);
    expect(temSigla(externo, r.exp, /^CM/)).toBe(false);
  });

  it("10. integrantes das guarnições mantêm o processamento de CM", () => {
    const { militares } = composicaoManual(1);
    const integrantes = militares.filter((m) => m.grupoOrdem !== undefined);
    const r = rodar({ militares, mes: MES, ano: ANO, temComposicaoOrdManual: true });
    expect(integrantes.some((m) => temSigla(m, r.exp, /^CM/))).toBe(true);
  });
});