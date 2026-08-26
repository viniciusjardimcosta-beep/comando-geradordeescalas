import { it } from "vitest";
import { militar, rodar, linha } from "/dev-server/src/utils/__tests__/escalaHarness";
it("dbg", () => {
  const m0 = militar({ nome: "FULANO DE TAL", matricula: "0000001", isCg: true });
  const ms = [m0, militar({ nome: "BELTRANO DE TAL", matricula: "0000002", isCov: true }),
    militar({ nome: "SICRANO DE TAL", matricula: "0000003", isCov: true }),
    militar({ nome: "AURELIANO DE TAL", matricula: "0000004" })];
  const r = rodar({ militares: ms, mes: 9, ano: 2026, ia: { lancamentos: [{ matricula: "0000001", dias: [9], linha: "HE", sigla: "HE24" }] } });
  console.log("ORD", linha(r.ord, m0, 30).join("|"));
  console.log("EXP", linha(r.exp, m0, 30).join("|"));
  console.log("HE ", linha(r.he, m0, 30).join("|"));
  console.log(r.alertas.filter(a=>/HE|reconcil|16h/i.test(a.msg)).map(a=>a.msg).slice(0,6));
});
