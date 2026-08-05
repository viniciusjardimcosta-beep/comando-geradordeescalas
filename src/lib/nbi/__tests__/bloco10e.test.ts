// Bloco 10E — testes: subtipos, comissões, catálogos e fundamentos.
import { describe, it, expect } from "vitest";
import {
  podeGerarOficial, normalizarEstado, rotuloEstado,
} from "@/lib/nbi/homologacao";
import {
  formaDocumentalDeSigla, buscarSigla, siglasUtilizadas, type SiglaInstitucional,
} from "@/lib/nbi/siglas";
import {
  fundamentosDoAssunto, fundamentoAutomatico, assuntoUsaFundamento,
  type FundamentoLegal,
} from "@/lib/nbi/fundamentos";
import {
  validarFuncoesComissao, exigeVarianteEspecial, codigoTemplateComissao,
  funcaoEfetiva, type IntegranteFuncao,
} from "@/lib/nbi/comissao";
import { obterMotor } from "@/lib/nbi/motores/registry";

const CAT: SiglaInstitucional[] = [
  { sigla: "SSCI", descricao_oficial: "Seção de Segurança Contra Incêndio", modo: "sigla" },
  { sigla: "CiaBM", descricao_oficial: "Companhia de Bombeiros Militar", modo: "descricao" },
  { sigla: "B1", descricao_oficial: "Seção de Pessoal", forma_documental: "Chefe da B1", modo: "personalizada" },
];

describe("10E — homologação de subtipos", () => {
  it("bloqueia geração de modelos não homologados", () => {
    expect(podeGerarOficial("homologado")).toBe(true);
    expect(podeGerarOficial("em_homologacao")).toBe(false);
    expect(podeGerarOficial("aguardando_exemplar")).toBe(false);
    expect(podeGerarOficial("bloqueado")).toBe(false);
  });

  it("normaliza estado ausente como homologado e rotula em português", () => {
    expect(normalizarEstado(null)).toBe("homologado");
    expect(rotuloEstado("aguardando_exemplar")).toMatch(/exemplar/i);
  });

  it("mantém o subtipo de convocação registrado porém bloqueado", () => {
    const motor = obterMotor("servico_extraordinario_convocacao");
    expect(motor).not.toBeNull();
    const pend = motor!.validar({
      campos: {}, camposTemplate: [], militar: null, titular: null, unidade: { nome: "", sigla: "" },
    } as never);
    expect(pend.some((p) => /exemplar|homologa/i.test(p))).toBe(true);
  });

  it("não altera o serviço extraordinário padrão", () => {
    expect(obterMotor("servico_extraordinario")).not.toBeNull();
    expect(podeGerarOficial("homologado")).toBe(true);
  });
});

describe("10E — catálogo de siglas", () => {
  it("preserva sigla não cadastrada sem inventar descrição", () => {
    expect(formaDocumentalDeSigla("XPTO", CAT)).toBe("XPTO");
    expect(buscarSigla("XPTO", CAT)).toBeNull();
  });

  it("aplica a forma escolhida quando cadastrada", () => {
    expect(formaDocumentalDeSigla("SSCI", CAT)).toBe("SSCI");
    expect(formaDocumentalDeSigla("CiaBM", CAT)).toBe("Companhia de Bombeiros Militar");
    expect(formaDocumentalDeSigla("B1", CAT)).toBe("Chefe da B1");
  });

  it("registra no snapshot apenas as siglas realmente usadas", () => {
    const usadas = siglasUtilizadas("Apresentou-se na SSCI e na B1.", CAT);
    expect(usadas.map((u) => u.sigla).sort()).toEqual(["B1", "SSCI"]);
  });
});

describe("10E — fundamentos legais", () => {
  const lista: FundamentoLegal[] = [
    { id: "1", codigo_assunto: "viagem", titulo: "A", texto_oficial: "T1", ativo: true, padrao: true },
    { id: "2", codigo_assunto: "viagem", titulo: "B", texto_oficial: "T2", ativo: true, padrao: false },
    { id: "3", codigo_assunto: "ferias", titulo: "C", texto_oficial: "T3", ativo: false, padrao: true },
  ];

  it("só exige fundamento quando o modelo declara o campo", () => {
    expect(assuntoUsaFundamento([{ chave: "DATA_INICIO" }])).toBe(false);
    expect(assuntoUsaFundamento([{ chave: "FUNDAMENTO" }])).toBe(true);
  });

  it("filtra por assunto e ignora inativos", () => {
    expect(fundamentosDoAssunto("viagem", lista)).toHaveLength(2);
    expect(fundamentosDoAssunto("ferias", lista)).toHaveLength(0);
  });

  it("aplica automaticamente apenas com um único padrão ativo", () => {
    expect(fundamentoAutomatico("viagem", lista)?.id).toBe("1");
    expect(fundamentoAutomatico("ferias", lista)).toBeNull();
    const dois = lista.map((f) => (f.id === "2" ? { ...f, padrao: true } : f));
    expect(fundamentoAutomatico("viagem", dois)).toBeNull();
  });
});

describe("10E — funções na comissão", () => {
  const presidente: IntegranteFuncao = { funcao: "presidente" };
  const membro: IntegranteFuncao = { funcao: "membro" };

  it("assume o primeiro integrante como presidente por compatibilidade", () => {
    expect(funcaoEfetiva({}, 0)).toBe("presidente");
    expect(funcaoEfetiva({}, 1)).toBe("membro");
  });

  it("exige exatamente um presidente", () => {
    expect(validarFuncoesComissao([presidente, membro])).toHaveLength(0);
    expect(validarFuncoesComissao([membro, membro]).length).toBeGreaterThan(0);
    expect(validarFuncoesComissao([presidente, presidente]).length).toBeGreaterThan(0);
  });

  it("permite dois presidentes apenas com confirmação administrativa", () => {
    expect(
      validarFuncoesComissao([presidente, presidente], { confirmarDoisPresidentes: true }),
    ).toHaveLength(0);
  });

  it("exige descrição quando a função é 'outra'", () => {
    const outra: IntegranteFuncao = { funcao: "outra" };
    expect(validarFuncoesComissao([presidente, outra]).length).toBeGreaterThan(0);
    expect(
      validarFuncoesComissao([presidente, { ...outra, funcao_outra: "Escrivão" }]),
    ).toHaveLength(0);
  });

  it("direciona Secretário/Relator para a variante ainda não homologada", () => {
    const sec: IntegranteFuncao = { funcao: "secretario" };
    expect(exigeVarianteEspecial([presidente, membro])).toBe(false);
    expect(exigeVarianteEspecial([presidente, sec])).toBe(true);
    expect(codigoTemplateComissao([presidente, membro])).toBe("nomeacao_comissao");
    expect(codigoTemplateComissao([presidente, sec])).toBe("nomeacao_comissao_funcoes");
  });
});
