import { it } from "vitest";
import { militar, rodar, linha } from "./escalaHarness";
it("dbg2", () => {
  const p = militar({ nome: "PARCIAL DE TAL", matricula: "0000009", tipoEscala: "parcial" });
  const ms = [p, militar({nome:"FULANO DE TAL",matricula:"0000001",isCg:true}), militar({nome:"BELTRANO DE TAL",matricula:"0000002",isCov:true}), militar({nome:"SICRANO DE TAL",matricula:"0000003",isCov:true}), militar({nome:"AURELIANO DE TAL",matricula:"0000004"})];
  const r = rodar({ militares: ms, mes: 9, ano: 2026, ia: { lancamentos: [{ matricula: "0000009", dias: [9], linha: "HE", sigla: "HE24" }] } });
  console.log("P HE", linha(r.he, p, 30).join("|"));
  const ms2 = [militar({nome:"FULANO DE TAL",matricula:"0000001",isCg:true}), militar({nome:"BELTRANO DE TAL",matricula:"0000002",isCov:true}), militar({nome:"SICRANO DE TAL",matricula:"0000003",isCov:true})];
  const r2 = rodar({ militares: ms2, mes: 9, ano: 2026, par: { modo: "ordinario_puro", militaresPorDia: 4 } });
  for (const m of ms2) {
    console.log(m.nome, "ORD", linha(r2.ord,m,30).join("|"));
    console.log(m.nome, "EXP", linha(r2.exp,m,30).join("|"));
    console.log(m.nome, "HE ", linha(r2.he,m,30).join("|"));
  }
  console.log(r2.alertas.map(a=>a.tipo+": "+a.msg).slice(0,8));
});
