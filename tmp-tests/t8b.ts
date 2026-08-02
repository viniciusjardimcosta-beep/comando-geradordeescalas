import { formatarLotacaoNbi, funcaoDocumentalDe, comporFuncaoDocumental } from "../src/lib/nbi/formatacao";
import { motorAssuncaoFuncao } from "../src/lib/nbi/motores/assuncaoFuncao";
import { motorDispensaFuncao } from "../src/lib/nbi/motores/dispensaFuncao";

const base = {
  id: "1", nome: "Soldado Silva", nome_guerra: null, posto_graduacao: "2º SGT",
  matricula: "666666", quadro: "QPBM", lotacao_nbi: null, funcao_atual: null,
  distribuicao_interna_nbi: null, genero_gramatical: "M",
  gbm_nbi: "2", pelotao_nbi: "6", companhia_nbi: "8", batalhao_nbi: "15",
  secao_nbi: null, subsecao_nbi: null, setor_nbi: null, cidade_nbi: null,
  funcao_administrativa_nbi: null, funcao_documental_nbi: null,
};
console.log("lotacao:", formatarLotacaoNbi({ gbm: "2", pelotao: "6", companhia: "8", batalhao: "15" }));
console.log("setor:", formatarLotacaoNbi({ setor: "Setor de Vistorias", subsecao: "SSeg", batalhao: "12" }));
console.log("auto:", comporFuncaoDocumental(base));
console.log("doc preenchida:", funcaoDocumentalDe({ ...base, funcao_documental_nbi: "2º SGT DO SETOR DE VISTORIAS / SSeg / 12ºBBM" }));
const camposTemplate = [{ chave: "FUNCAO", label: "Função", tipo: "text", obrigatorio: true }, { chave: "MOTIVO", label: "Motivo", tipo: "text", obrigatorio: true }, { chave: "DATA_INICIO", label: "Início", tipo: "date", obrigatorio: true }];
const ctx = { campos: { FUNCAO: "x", MOTIVO: "y", DATA_INICIO: "2026-02-01" }, militar: base as any, titular: { ...base, id: "2", nome: "1º SGT Titular", funcao_documental_nbi: "CHEFE DA 2ª SEÇÃO" } as any, camposTemplate } as any;
console.log("assuncao válida:", motorAssuncaoFuncao.validar(ctx));
console.log("placeholders:", motorAssuncaoFuncao.montarPlaceholders(ctx));
console.log("dispensa válida:", motorDispensaFuncao.validar(ctx));
