import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { gerarNbi, baixarNbi, proximoNumeroPrevisto } from "@/lib/nbi.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { auditarPreGeracao } from "@/lib/nbi/auditoria";
import { siglasUtilizadas, type SiglaInstitucional } from "@/lib/nbi/siglas";
import { funcaoEfetiva, type IntegranteFuncao } from "@/lib/nbi/comissao";
import type { IntegranteComissao } from "@/lib/nbi/derivados";
import { PainelAuditoria } from "@/components/nbi/PainelAuditoria";
import { detectarDuplicidades } from "@/lib/nbi/duplicidade";
import { resolverDataDispensa } from "@/lib/nbi/dataDispensa";
import {
  Loader2, Save, ArrowLeft, ArrowRight, Plus, Trash2, ChevronUp, ChevronDown,
  Wand2, AlertTriangle, CheckCircle2, FileText,
} from "lucide-react";
import {
  type AssuntoTipo, type MilitarNbi, type FeriasReg,
  periodoOrdinal, analisarFraseNbi, postoMilitarCombina,
  normalizarTextoNbi,
  somarDiasISO, diasEntreISO, formatarDataBR, interpolarTexto,
} from "@/utils/nbi";
import { CODIGOS_HOMOLOGADOS } from "@/utils/nbi-categorias";
import { funcaoDocumentalDe, lotacaoDocumentalDe, comporFuncaoDocumental } from "@/lib/nbi/formatacao";
import { MOTIVOS_FUNCAO, textoMotivo, motivoPorTexto, TEXTO_FERIAS } from "@/lib/nbi/motivos";

import { obterMotor, type ContextoMotor } from "@/lib/nbi/motores/registry";
import { resolverBase, validarMilitar, validarCamposTemplate } from "@/lib/nbi/motores/comum";
import { AssuntoPicker, type TemplatePickable } from "@/components/nbi/AssuntoPicker";
import { CampoLivreCorrigido } from "@/components/nbi/CampoLivreCorrigido";
import { CampoDerivado } from "@/components/nbi/CampoDerivado";
import { MissaoField } from "@/components/nbi/MissaoField";
import { ComissaoBuilder } from "@/components/nbi/ComissaoBuilder";
import {
  calcularDerivados, estaManual, chaveManual, origensDeAssunto,
} from "@/lib/nbi/derivados";
import { campoOculto } from "@/lib/nbi/campos";
import { montarDicionarioDinamico } from "@/utils/nbi-dicionario";
import { sugestoesTexto, aplicarSugestao as aplicarSugestaoTexto } from "@/utils/nbi-corretor";
import { useSpellchecker } from "@/hooks/use-spellcheck";


export const Route = createFileRoute("/app/nbi/nova")({
  component: NovaNbiPage,
  validateSearch: (s: Record<string, unknown>): { rascunho?: string } => ({
    rascunho: typeof s.rascunho === "string" ? s.rascunho : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nova NBI — Comando" },
      { name: "description", content: "Assistente de criação de Nota para Boletim Interno." },
    ],
  }),
});

interface TemplateRow {
  id: string;
  codigo: string;
  titulo: string;
  titulo_documento: string | null;
  disponivel: boolean;
  ordem: number;
  texto_modelo: string;
  estado_homologacao?: string | null;
  subtipo?: string | null;
  versao?: number | null;
  campos: Array<{
    chave: string;
    label: string;
    tipo: string;
    obrigatorio?: boolean;
    obrigatorio_se?: string;
    origem?: string;
    auto?: string;
    default?: unknown;
  }>;
}

interface AssuntoLocal {
  id: string;
  tipo: AssuntoTipo;
  militar_id: string | null;
  militar_titular_id: string | null;
  ferias_id: string | null;
  /** Bloco 8C — origem dos dados de Assunção/Dispensa. */
  origem_dados?: "manual" | "ferias" | "assuncao";
  /** Substituição aberta vinculada (apenas Dispensa a partir de Assunção). */
  substituicao_id?: string | null;
  campos: Record<string, string | boolean>;
}

/** Substituição em aberto (nbi_substituicoes) — exclusiva do módulo NBI. */
export interface SubstituicaoAberta {
  id: string;
  assuncao_documento_id: string | null;
  substituto_militar_id: string | null;
  titular_militar_id: string | null;
  funcao: string | null;
  motivo: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  /** NBI de origem da Assunção (quando o documento ainda existe). */
  assuncao?: { numero: string | null; ano: number | null } | null;
}


interface ResponsavelSnap {
  nome: string;
  posto_quadro: string;
  funcao: string;
  lotacao: string;
}

interface Rascunho {
  modo_numeracao: "manual" | "automatico";
  numero: string;
  ano: number;
  data_documento: string;
  unidade: { nome: string; sigla: string };
  digitador: ResponsavelSnap;
  comandante: ResponsavelSnap;
  autoridade: ResponsavelSnap;
  assuntos: AssuntoLocal[];
}

const RESP_VAZIO_KEY = "__resp_vazio__" as const; void RESP_VAZIO_KEY;
const RESP_VAZIO: ResponsavelSnap = { nome: "", posto_quadro: "", funcao: "", lotacao: "" };

function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Identificadores estáveis para automação de testes (Bloco 10C).
 * Sempre derivados do id do assunto — nunca do índice visual, pois os
 * cards podem ser reordenados.
 */
const APELIDO_TESTID: Record<string, string> = {
  DATA_INICIO: "data-inicio",
  DATA_FIM: "data-fim",
  FUNCAO_ASSUMIDA: "funcao-assumida",
  FUNCAO_DISPENSADA: "funcao-dispensada",
  MOTIVO_TITULAR: "motivo-afastamento",
  MOTIVO_RETORNO: "motivo-retorno",
};
function testIdCampo(assuntoId: string, chave: string): string {
  const apelido = APELIDO_TESTID[chave.toUpperCase()];
  return `assunto-${assuntoId}-${apelido ?? `campo-${chave}`}`;
}

function NovaNbiPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const search = useSearch({ from: "/app/nbi/nova" });
  const rascunhoId = search.rascunho ?? null;

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [documentoId, setDocumentoId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [militares, setMilitares] = useState<MilitarNbi[]>([]);
  const [ferias, setFerias] = useState<FeriasReg[]>([]);
  const [siglas, setSiglas] = useState<SiglaInstitucional[]>([]);
  const [substituicoes, setSubstituicoes] = useState<SubstituicaoAberta[]>([]);


  const [rascunho, setRascunho] = useState<Rascunho>({
    modo_numeracao: "automatico",
    numero: "",
    ano: new Date().getFullYear(),
    data_documento: new Date().toISOString().slice(0, 10),
    unidade: { nome: "", sigla: "" },
    digitador: { ...RESP_VAZIO },
    comandante: { ...RESP_VAZIO },
    autoridade: { ...RESP_VAZIO },
    assuntos: [],
  });

  useEffect(() => {
    if (!userId) return;
    void carregar(userId, rascunhoId);
  }, [userId, rascunhoId]);

  // Substituições em aberto mudam a cada NBI gerada — a lista precisa poder
  // ser reconsultada sem recarregar a página inteira.
  async function recarregarSubstituicoes() {
    if (!userId) return;
    const { data } = await supabase.from("nbi_substituicoes")
      .select("id,assuncao_documento_id,substituto_militar_id,titular_militar_id,funcao,motivo,data_inicio,data_fim_prevista,assuncao:nbi_documents!assuncao_documento_id(numero,ano)")
      .eq("user_id", userId).eq("status", "aberta").order("created_at", { ascending: false });
    setSubstituicoes((data ?? []) as SubstituicaoAberta[]);
  }



  async function carregar(uid: string, rascId: string | null) {
    setLoading(true);
    try {
      const [tpl, mil, fer, cfg, sub] = await Promise.all([
        supabase.from("nbi_templates").select("id,codigo,titulo,titulo_documento,disponivel,ordem,texto_modelo,campos,estado_homologacao,subtipo,versao").order("ordem"),
        supabase.from("militares").select("id,nome,nome_guerra,posto_graduacao,matricula,quadro,lotacao_nbi,funcao_atual,distribuicao_interna_nbi,genero_gramatical,gbm_nbi,companhia_nbi,pelotao_nbi,secao_nbi,subsecao_nbi,setor_nbi,cidade_nbi,batalhao_nbi,funcao_administrativa_nbi,funcao_documental_nbi").eq("user_id", uid).eq("ativo", true).order("nome"),
        supabase.from("ferias_militares").select("id,militar_id,ano,periodo,data_inicio,data_fim").eq("user_id", uid),
        supabase.from("nbi_settings").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("nbi_substituicoes")
          .select("id,assuncao_documento_id,substituto_militar_id,titular_militar_id,funcao,motivo,data_inicio,data_fim_prevista,assuncao:nbi_documents!assuncao_documento_id(numero,ano)")
          .eq("user_id", uid).eq("status", "aberta").order("created_at", { ascending: false }),
      ]);
      if (tpl.data) setTemplates(tpl.data as unknown as TemplateRow[]);
      if (mil.data) setMilitares(mil.data as MilitarNbi[]);
      if (fer.data) setFerias(fer.data as FeriasReg[]);
      if (sub.data) setSubstituicoes(sub.data as SubstituicaoAberta[]);
      // Bloco 10E — catálogo institucional de siglas do usuário (opcional).
      const sig = await supabase
        .from("nbi_siglas_institucionais")
        .select("id,sigla,descricao_oficial,forma_documental,categoria,ativo")
        .eq("user_id", uid).eq("ativo", true);
      if (sig.data) setSiglas(sig.data as unknown as SiglaInstitucional[]);

      if (cfg.data) {
        const d = cfg.data;
        setRascunho((r) => ({
          ...r,
          unidade: { nome: d.unidade_nome ?? "", sigla: d.unidade_sigla ?? "" },
          digitador: {
            nome: d.digitador_nome ?? "",
            posto_quadro: d.digitador_posto_quadro ?? "",
            funcao: d.digitador_funcao ?? "",
            lotacao: d.digitador_lotacao ?? "",
          },
          comandante: {
            nome: d.comandante_nome ?? "",
            posto_quadro: d.comandante_posto_quadro ?? "",
            funcao: d.comandante_funcao ?? "",
            lotacao: d.comandante_lotacao ?? "",
          },
          autoridade: {
            nome: d.autoridade_nome ?? "",
            posto_quadro: d.autoridade_posto_quadro ?? "",
            funcao: d.autoridade_funcao ?? "",
            lotacao: d.autoridade_lotacao ?? "",
          },
        }));
      }
      if (rascId) {
        const { data: doc } = await supabase
          .from("nbi_documents")
          .select("id,snapshot,status")
          .eq("id", rascId).eq("user_id", uid).maybeSingle();
        const snap = (doc?.snapshot as { rascunho?: Rascunho } | null)?.rascunho;
        if (snap && Array.isArray(snap.assuntos)) {
          setRascunho(snap);
          setDocumentoId(doc!.id);
          toast.success("Rascunho restaurado");
        } else if (doc) {
          toast.error("Rascunho sem dados estruturados");
        }
      }
    } catch (e) {
      console.error("Erro ao carregar dados NBI", e);
      toast.error("Falha ao carregar dados do módulo NBI");
    } finally {
      setLoading(false);
    }
  }

  const templatePor = useMemo(() => {
    const m = new Map<string, TemplateRow>();
    for (const t of templates) m.set(t.codigo, t);
    return m;
  }, [templates]);

  function adicionarAssunto(codigo: string) {
    const t = templatePor.get(codigo);
    if (!t) return;
    if (!CODIGOS_HOMOLOGADOS.has(codigo) || !t.disponivel) {
      toast.error("Modelo ainda não configurado para geração");
      return;
    }
    const campos: Record<string, string | boolean> = {};
    for (const c of t.campos) {
      if (c.tipo === "boolean") campos[c.chave] = Boolean(c.default ?? false);
      else if (c.default !== undefined && c.default !== null) campos[c.chave] = String(c.default);
    }
    // Bloco 11A — APRESENTAÇÃO é agregadora: começa na origem padrão (férias).
    if (codigo === "apresentacao") campos.SUBTIPO = SUBTIPO_APRESENTACAO_PADRAO;
    setRascunho((r) => ({
      ...r,
      assuntos: [...r.assuntos, {
        id: uid(),
        tipo: codigo as AssuntoTipo,
        militar_id: null,
        militar_titular_id: null,
        ferias_id: null,
        origem_dados: "manual",
        substituicao_id: null,

        campos,
      }],
    }));
  }

  /**
   * Bloco 11A — origens automáticas: a apresentação é consequência do
   * afastamento. Todos os dados são herdados; nada é redigitado.
   */
  function gerarApresentacaoDe(origem: AssuntoLocal) {
    const sub = subtipoPorOrigem(origem.tipo);
    const tApresentacao = templatePor.get("apresentacao");
    if (!sub || !tApresentacao) return;
    if (!sub.homologado) {
      toast.error("Apresentação deste afastamento aguarda exemplar oficial.");
      return;
    }
    const motor = obterMotor(origem.tipo);
    const resolvidos = motor
      ? motor.resolverCampos(contextoDe(origem))
      : resolverBase(contextoDe(origem));
    const campos: Record<string, string | boolean> = { SUBTIPO: sub.id };
    for (const chave of ["QTD_DIAS", "PERIODO", "ANO"]) {
      const bruto = origem.campos[chave];
      if (bruto !== undefined && bruto !== "") campos[chave] = bruto;
    }
    // Datas seguem em ISO: a formatação oficial acontece no motor.
    const dataFim = String(origem.campos.DATA_FIM ?? "")
      || (origem.campos.DATA_INICIO && resolvidos.QTD_DIAS
        ? somarDiasISO(String(origem.campos.DATA_INICIO), parseInt(resolvidos.QTD_DIAS, 10) - 1)
        : "");
    if (dataFim) campos.DATA_APRESENTACAO = somarDiasISO(dataFim, 1);
    if (!campos.QTD_DIAS && resolvidos.QTD_DIAS) {
      campos.QTD_DIAS = String(parseInt(resolvidos.QTD_DIAS, 10));
    }
    setRascunho((r) => {
      const idx = r.assuntos.findIndex((a) => a.id === origem.id);
      const novo: AssuntoLocal = {
        id: uid(),
        tipo: "apresentacao" as AssuntoTipo,
        militar_id: origem.militar_id,
        militar_titular_id: null,
        ferias_id: origem.ferias_id,
        origem_dados: "manual",
        substituicao_id: null,
        campos,
      };
      const arr = [...r.assuntos];
      arr.splice(idx + 1, 0, novo);
      return { ...r, assuntos: arr };
    });
    toast.success("Apresentação gerada a partir do afastamento.");
  }


  function atualizarAssunto(id: string, patch: Partial<AssuntoLocal>) {
    setRascunho((r) => ({
      ...r,
      assuntos: r.assuntos.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }
  function atualizarCampo(id: string, chave: string, valor: string | boolean) {
    setRascunho((r) => ({
      ...r,
      assuntos: r.assuntos.map((a) => (a.id === id ? { ...a, campos: { ...a.campos, [chave]: valor } } : a)),
    }));
  }
  function removerAssunto(id: string) {
    setRascunho((r) => ({ ...r, assuntos: r.assuntos.filter((a) => a.id !== id) }));
  }
  function moverAssunto(id: string, dir: -1 | 1) {
    setRascunho((r) => {
      const idx = r.assuntos.findIndex((a) => a.id === id);
      const alvo = idx + dir;
      if (idx < 0 || alvo < 0 || alvo >= r.assuntos.length) return r;
      const arr = [...r.assuntos];
      [arr[idx], arr[alvo]] = [arr[alvo], arr[idx]];
      return { ...r, assuntos: arr };
    });
  }

  // Contexto do motor NBI — dados brutos do assunto + cadastro envolvido.
  function contextoDe(a: AssuntoLocal): ContextoMotor {
    const t = templatePor.get(a.tipo);
    return {
      campos: a.campos,
      militar: militares.find((m) => m.id === a.militar_id) ?? null,
      titular: militares.find((m) => m.id === a.militar_titular_id) ?? null,
      camposTemplate: (t?.campos ?? []) as ContextoMotor["camposTemplate"],
    };
  }

  // Resolve valores finais do assunto (apenas em memória, não altera texto oficial).
  // Toda a regra por assunto vive no motor correspondente (registry).
  function resolverValores(a: AssuntoLocal): Record<string, string> {
    const t = templatePor.get(a.tipo);
    if (!t) return {};
    const ctx = contextoDe(a);
    const motor = obterMotor(a.tipo);
    return motor ? motor.resolverCampos(ctx) : resolverBase(ctx);
  }

  function textoFinal(a: AssuntoLocal): { texto: string; ausentes: string[] } {
    const t = templatePor.get(a.tipo);
    if (!t) return { texto: "", ausentes: [] };
    // Assuntos com mais de uma redação oficial: o motor indica qual template
    // (linha de nbi_templates) contém a redação correta para este contexto.
    const motor = obterMotor(a.tipo);
    const codigoEfetivo = motor?.codigoTemplateEfetivo?.(contextoDe(a)) ?? t.codigo;
    const tEfetivo = templatePor.get(codigoEfetivo) ?? t;
    return interpolarTexto(tEfetivo.texto_modelo, resolverValores(a));
  }


  // Pendências bloqueantes por assunto — delegadas ao motor do assunto.
  function pendencias(a: AssuntoLocal): string[] {
    const t = templatePor.get(a.tipo);
    if (!t) return ["template não encontrado"];
    const ctx = contextoDe(a);
    const motor = obterMotor(a.tipo);
    if (motor) return motor.validar(ctx);
    return [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
  }


  async function salvarRascunho() {
    if (!userId) return;
    setSalvando(true);
    try {
      const snapshot = rascunho.assuntos.map((a) => {
        const t = templatePor.get(a.tipo);
        const { texto, ausentes } = textoFinal(a);
        const militar = militares.find((m) => m.id === a.militar_id) ?? null;
        const titular = militares.find((m) => m.id === a.militar_titular_id) ?? null;
        // Snapshot rico: preserva dados cadastrais usados (titular e substituto)
        // mesmo que o texto oficial não imprima todos os campos.
        const dadosTitular = titular ? {
          militar_id: titular.id,
          nome: titular.nome,
          posto_graduacao: titular.posto_graduacao,
          quadro: titular.quadro,
          matricula: titular.matricula,
          lotacao_nbi: titular.lotacao_nbi,
          funcao_atual: titular.funcao_atual,
          distribuicao_interna_nbi: titular.distribuicao_interna_nbi,
          gbm_nbi: titular.gbm_nbi ?? null,
          companhia_nbi: titular.companhia_nbi ?? null,
          pelotao_nbi: titular.pelotao_nbi ?? null,
          secao_nbi: titular.secao_nbi ?? null,
          subsecao_nbi: titular.subsecao_nbi ?? null,
          setor_nbi: titular.setor_nbi ?? null,
          cidade_nbi: titular.cidade_nbi ?? null,
          batalhao_nbi: titular.batalhao_nbi ?? null,
          funcao_administrativa_nbi: titular.funcao_administrativa_nbi ?? null,
          funcao_documental_nbi: titular.funcao_documental_nbi ?? null,
          funcao_documental_resolvida: funcaoDocumentalDe(titular),
          lotacao_documental_resolvida: lotacaoDocumentalDe(titular),
          genero_gramatical: titular.genero_gramatical,
        } : null;
        const dadosMilitar = militar ? {
          militar_id: militar.id,
          nome: militar.nome,
          posto_graduacao: militar.posto_graduacao,
          quadro: militar.quadro,
          matricula: militar.matricula,
          lotacao_nbi: militar.lotacao_nbi,
          funcao_atual: militar.funcao_atual,
          distribuicao_interna_nbi: militar.distribuicao_interna_nbi,
          gbm_nbi: militar.gbm_nbi ?? null,
          companhia_nbi: militar.companhia_nbi ?? null,
          pelotao_nbi: militar.pelotao_nbi ?? null,
          secao_nbi: militar.secao_nbi ?? null,
          subsecao_nbi: militar.subsecao_nbi ?? null,
          setor_nbi: militar.setor_nbi ?? null,
          cidade_nbi: militar.cidade_nbi ?? null,
          batalhao_nbi: militar.batalhao_nbi ?? null,
          funcao_administrativa_nbi: militar.funcao_administrativa_nbi ?? null,
          funcao_documental_nbi: militar.funcao_documental_nbi ?? null,
          funcao_documental_resolvida: funcaoDocumentalDe(militar),
          lotacao_documental_resolvida: lotacaoDocumentalDe(militar),
          genero_gramatical: militar.genero_gramatical,
        } : null;
        return {
          tipo: a.tipo,
          template_codigo: t?.codigo ?? a.tipo,
          titulo: t?.titulo ?? a.tipo,
          titulo_documento:
            (t as unknown as { titulo_documento?: string | null } | undefined)?.titulo_documento ??
            (t?.titulo ?? a.tipo).toUpperCase(),
          militar_id: a.militar_id,
          militar_titular_id: a.militar_titular_id,
          militar_snapshot: dadosMilitar,
          titular_snapshot: dadosTitular,
          ferias_id: a.ferias_id,
          origem_dados: a.origem_dados ?? "manual",
          // Bloco 8C — vínculo Assunção ⇄ Dispensa (isolado no snapshot; o
          // backend replica em nbi_substituicoes ao gerar o documento).
          substituicao: (a.tipo === "assuncao_funcao" || a.tipo === "dispensa_funcao") ? {
            papel: a.tipo === "assuncao_funcao" ? "assuncao" : "dispensa",
            substituicao_id: a.substituicao_id ?? null,
            funcao: String(a.campos.FUNCAO_ASSUMIDA ?? a.campos.FUNCAO_DISPENSADA ?? ""),
            motivo: String(a.campos.MOTIVO_TITULAR ?? a.campos.MOTIVO_RETORNO ?? ""),
            data_inicio: String(a.campos.DATA_INICIO ?? "") || null,
            data_fim_prevista: String(a.campos.DATA_DISPENSA_PREVISTA ?? "") || null,
            substituto_militar_id: a.militar_id,
            titular_militar_id: a.militar_titular_id,
          } : null,
          campos: a.campos,
          // Bloco 9B — origem de cada campo derivado e marcação de substituição manual.
          origens_campos: origensDeAssunto(a.tipo, a.campos, {
            unidadeSigla: rascunho.unidade.sigla,
            unidadeNome: rascunho.unidade.nome,
            origemDados: a.origem_dados ?? "manual",
          }),
          texto_final: texto,
          campos_ausentes: ausentes,
          pendencias: pendencias(a),
          // Bloco 10E — rastreabilidade de subtipo, homologação e catálogos.
          codigo_motor: obterMotor(a.tipo)?.codigo ?? a.tipo,
          versao_motor: t?.versao ?? 1,
          subtipo: t?.subtipo ?? null,
          template_id: t?.id ?? null,
          estado_homologacao: t?.estado_homologacao ?? "homologado",
          fundamento_aplicado: String(a.campos.FUNDAMENTO ?? "") || null,
          fundamento_id: String(a.campos.fundamento_id ?? "") || null,
          siglas_utilizadas: siglasUtilizadas(texto, siglas),
          comissao: a.tipo === "nomeacao_comissao" ? (() => {
            try {
              const arr = JSON.parse(String(a.campos.integrantes_json ?? "[]")) as IntegranteComissao[];
              return Array.isArray(arr)
                ? arr.map((i, idx) => ({
                    tipo: i.tipo,
                    militar_id: i.militar_id ?? null,
                    nome: i.nome ?? null,
                    documento: i.documento ?? null,
                    funcao: funcaoEfetiva(i as unknown as IntegranteFuncao, idx),
                    funcao_outra: i.funcao_outra ?? null,
                  }))
                : [];
            } catch { return []; }
          })() : null,


        };
      });
      const payload = {
        user_id: userId,
        numero: rascunho.numero || null,
        ano: rascunho.ano,
        data_documento: rascunho.data_documento,
        titulo: `NBI ${rascunho.numero || "s/nº"} — ${formatarDataBR(rascunho.data_documento)}`,
        assuntos: snapshot,
        responsaveis: JSON.parse(JSON.stringify({
          unidade: rascunho.unidade,
          digitador: rascunho.digitador,
          comandante: rascunho.comandante,
          autoridade: rascunho.autoridade,
        })),
        snapshot: JSON.parse(JSON.stringify({ rascunho })),
        status: "rascunho",
      };
      if (documentoId) {
        const { error } = await supabase.from("nbi_documents").update(payload).eq("id", documentoId);
        if (error) throw error;
        toast.success("Rascunho atualizado");
      } else {
        const { data, error } = await supabase.from("nbi_documents").insert([payload]).select("id").single();
        if (error) throw error;
        if (data?.id) setDocumentoId(data.id);
        toast.success("Rascunho salvo com sucesso");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar rascunho");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="h-6 w-6" /> Nova NBI</h1>
          <p className="text-sm text-muted-foreground">Assistente em 3 etapas · dados → assuntos → conferência</p>
        </div>
        <Link to="/app/nbi/configuracoes"><Button variant="outline" size="sm">Configurações</Button></Link>
      </header>

      <div className="mb-6 flex gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`flex-1 rounded-md border p-2 text-center text-xs ${etapa === n ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground"}`}>
            Etapa {n} — {n === 1 ? "Dados da nota" : n === 2 ? "Assuntos" : "Conferência"}
          </div>
        ))}
      </div>

      {etapa === 1 && (
        <Etapa1
          rascunho={rascunho}
          setRascunho={setRascunho}
          onNext={() => setEtapa(2)}
        />
      )}
      {etapa === 2 && (
        <Etapa2
          rascunho={rascunho}
          templates={templates}
          militares={militares}
          ferias={ferias}
          substituicoes={substituicoes}
          onRecarregarSubstituicoes={recarregarSubstituicoes}

          adicionar={adicionarAssunto}
          atualizar={atualizarAssunto}
          atualizarCampo={atualizarCampo}
          remover={removerAssunto}
          mover={moverAssunto}
          onBack={() => setEtapa(1)}
          onNext={() => setEtapa(3)}
        />
      )}
      {etapa === 3 && (
        <Etapa3
          rascunho={rascunho}
          templates={templates}
          militares={militares}
          textoFinal={textoFinal}
          pendencias={pendencias}
          atualizarCampo={atualizarCampo}
          onBack={() => setEtapa(2)}
          onSalvar={salvarRascunho}
          salvando={salvando}
          documentoId={documentoId}
          onRecarregarSubstituicoes={recarregarSubstituicoes}

        />
      )}
    </div>
  );
}

// ============ ETAPA 1 ============

function Etapa1({
  rascunho, setRascunho, onNext,
}: {
  rascunho: Rascunho;
  setRascunho: React.Dispatch<React.SetStateAction<Rascunho>>;
  onNext: () => void;
}) {
  const modoManual = rascunho.modo_numeracao === "manual";
  const numeroManualOk = !modoManual || (rascunho.numero.trim() !== "" && rascunho.ano > 1900);
  const podeAvancar = rascunho.data_documento && rascunho.unidade.nome && rascunho.comandante.nome && numeroManualOk;

  function editarResp(chave: "digitador" | "comandante" | "autoridade", campo: keyof ResponsavelSnap, valor: string) {
    setRascunho((r) => ({ ...r, [chave]: { ...r[chave], [campo]: valor } }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados gerais da NBI</CardTitle>
        <CardDescription>Estes valores vêm das Configurações; edite se necessário para esta nota.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border p-4">
          <Label className="mb-2 block text-sm font-semibold">Modo de numeração</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo_numeracao"
                checked={rascunho.modo_numeracao === "automatico"}
                onChange={() => setRascunho({ ...rascunho, modo_numeracao: "automatico", numero: "" })}
              />
              Usar próximo número automático
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo_numeracao"
                checked={rascunho.modo_numeracao === "manual"}
                onChange={() => setRascunho({ ...rascunho, modo_numeracao: "manual" })}
              />
              Informar número manualmente
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {modoManual
              ? "O número informado será usado exatamente como digitado, após verificação de colisão."
              : "O próximo número da sequência será reservado no momento da geração."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Número {modoManual && <span className="text-destructive">*</span>}</Label>
            <Input
              value={rascunho.numero}
              onChange={(e) => setRascunho({ ...rascunho, numero: e.target.value })}
              placeholder={modoManual ? "Ex: 018" : "(automático)"}
              disabled={!modoManual}
            />
          </div>
          <div>
            <Label>Ano</Label>
            <Input type="number" value={rascunho.ano} onChange={(e) => setRascunho({ ...rascunho, ano: parseInt(e.target.value, 10) || new Date().getFullYear() })} />
          </div>
          <div>
            <Label>Data do documento</Label>
            <Input type="date" value={rascunho.data_documento} onChange={(e) => setRascunho({ ...rascunho, data_documento: e.target.value })} />
          </div>
        </div>


        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Unidade — nome</Label>
            <Input value={rascunho.unidade.nome} onChange={(e) => setRascunho({ ...rascunho, unidade: { ...rascunho.unidade, nome: e.target.value } })} />
          </div>
          <div>
            <Label>Unidade — sigla</Label>
            <Input value={rascunho.unidade.sigla} onChange={(e) => setRascunho({ ...rascunho, unidade: { ...rascunho.unidade, sigla: e.target.value } })} />
          </div>
        </div>

        {(["digitador", "comandante", "autoridade"] as const).map((k) => (
          <div key={k} className="rounded-md border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {k === "digitador" ? "Digitador" : k === "comandante" ? "Comandante" : "Autoridade publicadora"}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Nome</Label><Input value={rascunho[k].nome} onChange={(e) => editarResp(k, "nome", e.target.value)} /></div>
              <div><Label>Posto / Quadro</Label><Input value={rascunho[k].posto_quadro} onChange={(e) => editarResp(k, "posto_quadro", e.target.value)} /></div>
              <div><Label>Função</Label><Input value={rascunho[k].funcao} onChange={(e) => editarResp(k, "funcao", e.target.value)} /></div>
              <div><Label>Lotação</Label><Input value={rascunho[k].lotacao} onChange={(e) => editarResp(k, "lotacao", e.target.value)} /></div>
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!podeAvancar}>Avançar <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ ETAPA 2 ============

function Etapa2({
  rascunho, templates, militares, ferias, substituicoes, onRecarregarSubstituicoes,
  adicionar, atualizar, atualizarCampo, remover, mover,
  onBack, onNext,
}: {
  rascunho: Rascunho;
  templates: TemplateRow[];
  militares: MilitarNbi[];
  ferias: FeriasReg[];
  substituicoes: SubstituicaoAberta[];
  onRecarregarSubstituicoes: () => Promise<void> | void;

  adicionar: (codigo: string) => void;
  atualizar: (id: string, patch: Partial<AssuntoLocal>) => void;
  atualizarCampo: (id: string, chave: string, valor: string | boolean) => void;
  remover: (id: string) => void;
  mover: (id: string, dir: -1 | 1) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const total = rascunho.assuntos.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assuntos</CardTitle>
        <CardDescription>Adicione um ou mais assuntos. Você pode reordenar, editar e remover livremente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <AssuntoPicker
            templates={templates as TemplatePickable[]}
            onEscolher={(codigo) => adicionar(codigo)}
            testId="adicionar-assunto"
          />
          <span className="ml-auto text-xs text-muted-foreground">
            {total === 0 ? "Nenhum assunto adicionado" : total === 1 ? "1 assunto adicionado" : `${total} assuntos adicionados`}
          </span>
        </div>

        {rascunho.assuntos.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum assunto adicionado. Clique em <strong>Adicionar assunto</strong> para começar.
            <div className="mt-1 text-[11px]">
              Ex.: <em>Férias</em>, <em>Viagem</em>, <em>Assunção de função</em>.
            </div>
          </div>
        )}

        {rascunho.assuntos.map((a, idx) => {
          const t = templates.find((x) => x.codigo === a.tipo);
          if (!t) return null;
          return (
            <AssuntoCard
              key={a.id}
              index={idx + 1}
              assunto={a}
              template={t}
              militares={militares}
              ferias={ferias}
              substituicoes={substituicoes}
              onRecarregarSubstituicoes={onRecarregarSubstituicoes}

              anoNbi={parseInt(rascunho.data_documento.slice(0, 4), 10) || rascunho.ano}
              unidade={rascunho.unidade}

              onChange={(patch) => atualizar(a.id, patch)}
              onCampo={(chave, v) => atualizarCampo(a.id, chave, v)}
              onRemove={() => remover(a.id)}
              onUp={() => mover(a.id, -1)}
              onDown={() => mover(a.id, 1)}
            />
          );
        })}

        {rascunho.assuntos.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
            <AssuntoPicker
              templates={templates as TemplatePickable[]}
              onEscolher={(codigo) => adicionar(codigo)}
              label="Adicionar outro assunto"
              size="sm"
              testId="adicionar-outro-assunto"
            />
            <span className="text-xs text-muted-foreground">
              Pesquise por nome, título oficial ou categoria.
            </span>
          </div>
        )}


        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button data-testid="ir-para-conferencia" onClick={onNext} disabled={rascunho.assuntos.length === 0}>Ir para conferência <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssuntoCard({
  index, assunto, template, militares, ferias, substituicoes, onRecarregarSubstituicoes, anoNbi, unidade,
  onChange, onCampo, onRemove, onUp, onDown,
}: {
  index: number;
  assunto: AssuntoLocal;
  template: TemplateRow;
  militares: MilitarNbi[];
  ferias: FeriasReg[];
  substituicoes: SubstituicaoAberta[];
  onRecarregarSubstituicoes: () => Promise<void> | void;
  anoNbi: number;

  unidade: { nome: string; sigla: string };
  onChange: (patch: Partial<AssuntoLocal>) => void;
  onCampo: (chave: string, v: string | boolean) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const [frase, setFrase] = useState("");
  const [sugestoes, setSugestoes] = useState<Array<{ militar: MilitarNbi; ferias?: FeriasReg }>>([]);
  const [avisoSugestao, setAvisoSugestao] = useState<string | null>(null);

  const usaFerias = assunto.tipo === "ferias" || assunto.tipo === "apresentacao";

  // ── Bloco 9B — campos derivados (cálculo/banco/configurações) ──
  const derivados = useMemo(
    () => calcularDerivados(assunto.tipo, assunto.campos, {
      unidadeSigla: unidade.sigla, unidadeNome: unidade.nome,
      origemDados: assunto.origem_dados ?? "manual",
    }),
    [assunto.tipo, assunto.campos, assunto.origem_dados, unidade.sigla, unidade.nome],
  );
  const derivadoPor = useMemo(() => {
    const m = new Map<string, (typeof derivados)[number]>();
    for (const d of derivados) m.set(d.chave, d);
    return m;
  }, [derivados]);

  // Escreve o valor calculado no assunto sempre que ele mudar,
  // exceto quando o operador assumiu o campo manualmente.
  useEffect(() => {
    for (const d of derivados) {
      if (estaManual(assunto.campos, d.chave)) continue;
      if (String(assunto.campos[d.chave] ?? "") !== d.valor) onCampo(d.chave, d.valor);
    }
  }, [derivados]);

  // Dicionário dinâmico: nomes cadastrados + siglas militares fixas.
  // Palavras aqui não são marcadas como erro pelo corretor ortográfico.
  const dicionarioExtras = useMemo(() => montarDicionarioDinamico({
    militaresNome: militares.map((m) => m.nome),
    militaresNomeGuerra: militares.map((m) => m.nome_guerra),
    lotacoes: militares.map((m) => m.lotacao_nbi),
  }), [militares]);


  function interpretarFrase() {
    setSugestoes([]);
    setAvisoSugestao(null);
    const info = analisarFraseNbi(frase);

    // nenhum critério identificado
    if (!info.matricula && !info.postoCanonico && info.termos.length === 0) {
      setAvisoSugestao(
        'Não foi possível identificar o militar. Informe nome, matrícula ou posto. Ex.: "segundo período de férias do Soldado Silva".',
      );
      return;
    }

    // Extrai ano explícito da frase (4 dígitos entre 2000 e 2100), se houver.
    const anoMatch = frase.match(/\b(20\d{2})\b/);
    const anoAlvo = anoMatch ? parseInt(anoMatch[1], 10) : anoNbi;

    let candidatos = militares.slice();

    // filtro por matrícula (prioritário)
    if (info.matricula) {
      const filtro = candidatos.filter((m) => (m.matricula || "").includes(info.matricula!));
      if (filtro.length > 0) candidatos = filtro;
    }

    // filtro por posto/graduação
    if (info.postoCanonico) {
      const filtro = candidatos.filter((m) => postoMilitarCombina(m.posto_graduacao, info.postoCanonico));
      if (filtro.length > 0) candidatos = filtro;
    }

    // filtro por termos livres (nome, nome de guerra, matrícula, IDs fictícios)
    // Normalizações extras: "soldado1" ~ "soldado 1"; ignora espaços internos.
    if (info.termos.length > 0) {
      const compact = (s: string) => normalizarTextoNbi(s).replace(/\s+/g, "");
      const filtro = candidatos.filter((m) => {
        const alvos = [m.nome, m.nome_guerra, m.matricula]
          .filter((v): v is string => Boolean(v))
          .map((v) => normalizarTextoNbi(v));
        const alvosCompact = alvos.map(compact);
        return info.termos.some((t) => {
          const tc = compact(t);
          return alvos.some((a) => a.includes(t)) || alvosCompact.some((a) => a.includes(tc));
        });
      });
      if (filtro.length > 0) candidatos = filtro;
    }

    if (candidatos.length === 0) {
      setAvisoSugestao("Nenhum militar compatível encontrado com os termos informados.");
      return;
    }

    if (usaFerias) {
      const combos: Array<{ militar: MilitarNbi; ferias?: FeriasReg }> = [];
      for (const m of candidatos) {
        const filhas = ferias.filter((f) =>
          f.militar_id === m.id &&
          f.ano === anoAlvo &&
          (info.periodo == null || f.periodo === info.periodo),
        );
        if (filhas.length === 0) {
          // Só reporta o militar em foco quando não há férias — nunca lista o efetivo.
          if (info.periodo == null) combos.push({ militar: m });
        } else {
          for (const f of filhas) combos.push({ militar: m, ferias: f });
        }
      }
      if (combos.length === 0) {
        // Mensagem única, referindo-se somente aos candidatos identificados.
        if (candidatos.length === 1 && info.periodo != null) {
          const m = candidatos[0];
          setAvisoSugestao(
            `Não foi encontrado o ${periodoOrdinal(info.periodo)} período de férias de ${m.nome} no ano de ${anoAlvo}.`,
          );
        } else if (info.periodo != null) {
          setAvisoSugestao(
            `Nenhum dos ${candidatos.length} candidatos possui o ${periodoOrdinal(info.periodo)} período de férias registrado em ${anoAlvo}. Refine o termo (nome, matrícula ou posto).`,
          );
        } else {
          setAvisoSugestao(`Nenhum registro de férias em ${anoAlvo} para os candidatos identificados.`);
        }
        setSugestoes([]);
        return;
      }
      setSugestoes(combos);
      if (combos.length > 1) {
        setAvisoSugestao(`Foram encontrados ${combos.length} candidatos. Selecione o correto.`);
      } else {
        setAvisoSugestao("1 candidato encontrado — confirme antes de aplicar.");
      }
    } else {
      setSugestoes(candidatos.map((m) => ({ militar: m })));
      if (candidatos.length > 1) {
        setAvisoSugestao(`Foram encontrados ${candidatos.length} militares compatíveis. Selecione o correto.`);
      } else {
        setAvisoSugestao("1 candidato encontrado — confirme antes de aplicar.");
      }
    }
  }

  function aplicarSugestao(s: { militar: MilitarNbi; ferias?: FeriasReg }) {
    onChange({ militar_id: s.militar.id, ferias_id: s.ferias?.id ?? null });
    if (s.ferias) {
      const dias = diasEntreISO(s.ferias.data_inicio, s.ferias.data_fim);
      onCampo("DATA_INICIO", s.ferias.data_inicio);
      onCampo("DATA_FIM", s.ferias.data_fim);
      onCampo("QTD_DIAS", String(dias));
      onCampo("DATA_APRESENTACAO", somarDiasISO(s.ferias.data_fim, 1));
      onCampo("PERIODO", String(s.ferias.periodo));
      onCampo("ANO", String(s.ferias.ano));
    }
    setSugestoes([]);
    setAvisoSugestao("Sugestão aplicada — confirme os demais campos.");
  }

  return (
    <div
      className="rounded-md border border-border p-4"
      data-testid={`assunto-card-${assunto.id}`}
      data-assunto-id={assunto.id}
      data-assunto-tipo={assunto.tipo}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{index}</Badge>
          <span className="font-semibold">{template.titulo}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onUp}><ChevronUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDown}><ChevronDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-md bg-muted/40 p-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sugestão por frase (opcional)</Label>
        <div className="flex gap-2">
          <Input
            placeholder='Ex.: "segundo período de férias do Soldado Silva"'
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={interpretarFrase}><Wand2 className="mr-1 h-4 w-4" /> Interpretar</Button>
        </div>
        {avisoSugestao && (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> {avisoSugestao}
          </p>
        )}
        {sugestoes.length > 0 && (
          <div className="space-y-1">
            {sugestoes.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => aplicarSugestao(s)}
                className="w-full rounded border border-border bg-background p-2 text-left text-xs hover:bg-accent"
              >
                <span className="font-medium">{s.militar.nome}</span>
                {s.militar.matricula && <span className="ml-2 text-muted-foreground">ID {s.militar.matricula}</span>}
                {s.ferias && (
                  <span className="ml-2">
                    · {periodoOrdinal(s.ferias.periodo)} período/{s.ferias.ano} — {formatarDataBR(s.ferias.data_inicio)} a {formatarDataBR(s.ferias.data_fim)}
                  </span>
                )}
                {!s.ferias && usaFerias && <span className="ml-2 text-amber-600">sem registro de férias no ano</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3">
        <Label>Militar</Label>
        <Select value={assunto.militar_id ?? ""} onValueChange={(v) => onChange({ militar_id: v || null })}>
          <SelectTrigger data-testid={`assunto-${assunto.id}-militar`}><SelectValue placeholder="Selecionar militar" /></SelectTrigger>
          <SelectContent>
            {militares.map((m) => (
              <SelectItem key={m.id} value={m.id} data-testid={`assunto-${assunto.id}-militar-opcao-${m.id}`}>
                {m.posto_graduacao ?? ""} {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(assunto.tipo === "dispensa_funcao" || assunto.tipo === "assuncao_funcao") && (
        <div className="mb-3">
          <Label>
            {assunto.tipo === "assuncao_funcao"
              ? "Militar titular da função (afastado)"
              : "Militar titular (que retornou)"}
            <span className="text-destructive"> *</span>
          </Label>
          <Select value={assunto.militar_titular_id ?? ""} onValueChange={(v) => onChange({ militar_titular_id: v || null })}>
            <SelectTrigger data-testid={`assunto-${assunto.id}-titular`}><SelectValue placeholder="Selecionar titular" /></SelectTrigger>
            <SelectContent>
              {militares.filter((m) => m.id !== assunto.militar_id).map((m) => (
                <SelectItem key={m.id} value={m.id} data-testid={`assunto-${assunto.id}-titular-opcao-${m.id}`}>
                  {m.posto_graduacao ?? ""} {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dados do titular são preservados no snapshot mesmo quando não impressos no texto oficial.
          </p>
        </div>
      )}

      {(assunto.tipo === "dispensa_funcao" || assunto.tipo === "assuncao_funcao") && (
        <OrigemDadosFuncao
          assunto={assunto}
          militares={militares}
          ferias={ferias}
          substituicoes={substituicoes}
          onRecarregarSubstituicoes={onRecarregarSubstituicoes}

          anoNbi={anoNbi}
          onChange={onChange}
          onCampo={onCampo}
        />
      )}



      {/* Bloco 9B — Serviço extraordinário: mês de referência gera o período. */}
      {assunto.tipo === "servico_extraordinario" && (
        <div className="mb-3 rounded-md border border-dashed p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Mês de referência</Label>
          <Input
            type="month"
            className="mt-2 max-w-[220px]"
            value={String(assunto.campos.mes_referencia_sel ?? "")}
            onChange={(e) => onCampo("mes_referencia_sel", e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            O período (início, fim, mês por extenso e ano) é calculado automaticamente
            a partir do mês selecionado. Altere manualmente apenas se o serviço abranger
            período diferente do mês completo.
          </p>
        </div>
      )}

      {/* Bloco 9B — Nomeação de comissão: formulário integralmente estruturado. */}
      {assunto.tipo === "nomeacao_comissao" && (
        <div className="mb-3">
          <ComissaoBuilder campos={assunto.campos} militares={militares} onCampo={onCampo} />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {template.campos
          // Bloco 10 — fonte única: cadastro, gramática, cálculos e campos
          // estruturados nunca são digitados pelo operador.
          .filter((c) => !campoOculto(assunto.tipo, c.chave))
          .map((c) => {
            const tid = testIdCampo(assunto.id, c.chave);
            const derivado = derivadoPor.get(c.chave);
            if (derivado) {
              const manual = estaManual(assunto.campos, c.chave);
              return (
                <CampoDerivado
                  key={c.chave}
                  testId={tid}
                  label={c.label}
                  obrigatorio={!!c.obrigatorio}
                  valor={String(assunto.campos[c.chave] ?? derivado.valor)}
                  origem={derivado.origem}
                  detalhe={derivado.detalhe}
                  manual={manual}
                  tipo={c.tipo === "data" ? "date" : c.tipo === "inteiro" ? "number" : "text"}
                  onAlterarManual={() => onCampo(chaveManual(c.chave), true)}
                  onVoltarDerivado={() => {
                    onCampo(chaveManual(c.chave), false);
                    onCampo(c.chave, derivado.valor);
                  }}
                  onChange={(v) => onCampo(c.chave, v)}
                />
              );
            }
            if (assunto.tipo === "servico_extraordinario" && c.chave === "MISSAO") {
              return (
                <div key={c.chave} className="md:col-span-2">
                  <MissaoField
                    label={c.label}
                    obrigatorio={!!c.obrigatorio}
                    valor={String(assunto.campos[c.chave] ?? "")}
                    onChange={(v) => onCampo(c.chave, v)}
                  />
                </div>
              );
            }

            const val = assunto.campos[c.chave];
            if (c.tipo === "boolean") {
              return (
                <label key={c.chave} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    data-testid={tid}
                    checked={Boolean(val)}
                    onChange={(e) => onCampo(c.chave, e.target.checked)}
                  />
                  {c.label}
                </label>
              );
            }
            const chaveUp = c.chave.toUpperCase();

            // ── Motivo controlado (Assunção/Dispensa) ──
            if (chaveUp === "MOTIVO_TITULAR" || chaveUp === "MOTIVO_RETORNO") {
              return (
                <div key={c.chave} className="md:col-span-2">
                  <MotivoTitularField
                    chave={c.chave}
                    testId={tid}
                    label={c.label}
                    obrigatorio={!!c.obrigatorio}
                    valor={String(val ?? "")}
                    onChange={(v) => onCampo(c.chave, v)}
                    contexto={chaveUp === "MOTIVO_TITULAR" ? "afastamento" : "retorno"}
                  />
                </div>
              );
            }

            // ── Função assumida / dispensada (composição a partir do titular) ──
            if (chaveUp === "FUNCAO_ASSUMIDA" || chaveUp === "FUNCAO_DISPENSADA") {
              const titular = militares.find((m) => m.id === assunto.militar_titular_id) ?? null;
              return (
                <div key={c.chave} className="md:col-span-2">
                  <FuncaoComposta
                    chave={c.chave}
                    testId={tid}
                    label={c.label}
                    obrigatorio={!!c.obrigatorio}
                    valor={String(val ?? "")}
                    titular={titular}
                    onChange={(v) => onCampo(c.chave, v)}
                    extraWords={dicionarioExtras}
                  />
                </div>
              );
            }

            // Campos livres (texto/texto_longo) recebem corretor ortográfico offline.
            // ORIGEM/DESTINO/CIDADE ganham análise por expressão contra a base de municípios.
            const capitalizacao: "nome_proprio" | "inicial" | undefined =
              ["ORIGEM", "DESTINO", "CIDADE", "LOTACAO", "LOTACAO_TITULAR"].includes(chaveUp)
                ? "nome_proprio"
                : ["MISSAO", "MOTIVO", "OBSERVACAO", "OBSERVACOES"].includes(chaveUp)
                  ? "inicial"
                  : undefined;
            const modoToponimo = ["ORIGEM", "DESTINO", "CIDADE"].includes(chaveUp);

            if (c.tipo === "texto_longo") {
              return (
                <div key={c.chave} className="md:col-span-2">
                  <Label>{c.label}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
                  <CampoLivreCorrigido
                    testId={tid}
                    value={String(val ?? "")}
                    onChange={(v) => onCampo(c.chave, v)}
                    multiline
                    rows={2}
                    extraWords={dicionarioExtras}
                    capitalizacao={capitalizacao}
                    modoToponimo={modoToponimo}
                  />
                </div>
              );
            }
            if (c.tipo === "data" || c.tipo === "inteiro") {
              // Bloco 10 — campos derivados usam exclusivamente <CampoDerivado>
              // (tratado acima). Aqui restam apenas fatos administrativos.
              const inputType = c.tipo === "data" ? "date" : "number";
              return (
                <div key={c.chave}>
                  <Label>{c.label}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
                  <Input data-testid={tid} type={inputType} value={String(val ?? "")} onChange={(e) => onCampo(c.chave, e.target.value)} />
                </div>
              );
            }

            return (
              <div key={c.chave}>
                <Label>{c.label}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
                <CampoLivreCorrigido
                  testId={tid}
                  value={String(val ?? "")}
                  onChange={(v) => onCampo(c.chave, v)}
                  extraWords={dicionarioExtras}
                  capitalizacao={capitalizacao}
                  modoToponimo={modoToponimo}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ============ ETAPA 3 ============

function Etapa3({
  rascunho, templates, militares, textoFinal, pendencias, atualizarCampo, onBack, onSalvar, salvando,
  documentoId, onRecarregarSubstituicoes,
}: {
  rascunho: Rascunho;
  templates: TemplateRow[];
  militares: MilitarNbi[];
  textoFinal: (a: AssuntoLocal) => { texto: string; ausentes: string[] };
  pendencias: (a: AssuntoLocal) => string[];
  atualizarCampo: (assuntoId: string, chave: string, valor: string | boolean) => void;
  onBack: () => void;
  onSalvar: () => Promise<void> | void;
  salvando: boolean;
  documentoId: string | null;
  onRecarregarSubstituicoes: () => Promise<void> | void;

}) {
  const gerar = useServerFn(gerarNbi);
  const baixar = useServerFn(baixarNbi);
  const prox = useServerFn(proximoNumeroPrevisto);

  const [gerando, setGerando] = useState(false);
  const [gerado, setGerado] = useState<{ numero: number; ano: number } | null>(null);
  const [confirmarAno, setConfirmarAno] = useState(false);
  // Bloco 10C — override de duplicidade exige confirmação explícita.
  const [duplicarMesmoAssim, setDuplicarMesmoAssim] = useState(false);
  const [previsto, setPrevisto] = useState<{ proximo: number; ano_vigente: number; reiniciar_anualmente: boolean } | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string | null>(null);

  useEffect(() => {
    void prox().then((p) => setPrevisto(p));
  }, []);

  const resumoPend = rascunho.assuntos.map((a) => {
    const t = templates.find((x) => x.codigo === a.tipo);
    const militar = militares.find((m) => m.id === a.militar_id);
    return {
      id: a.id,
      titulo: t?.titulo ?? a.tipo,
      militar: militar?.nome ?? null,
      lista: pendencias(a),
    };
  });
  const totalPend = resumoPend.reduce((acc, r) => acc + r.lista.length, 0);
  const semAssuntos = rascunho.assuntos.length === 0;

  // Bloco 10C — duplicidade por ASSINATURA ESPECÍFICA DO MOTOR.
  // Assuntos legítimos semelhantes (duas viagens no mesmo dia para destinos
  // diferentes) deixam de ser bloqueados; só a repetição real é barrada.
  const duplicidades = detectarDuplicidades(
    rascunho.assuntos.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      militar_id: a.militar_id ?? null,
      militar_titular_id: a.militar_titular_id ?? null,
      substituicao_id: a.substituicao_id ?? null,
      campos: a.campos,
    })),
  );
  const duplicados = duplicidades.map((d) => {
    const a = rascunho.assuntos[d.indices[0]];
    const t = templates.find((x) => x.codigo === a.tipo);
    const militar = militares.find((m) => m.id === a.militar_id);
    return `${t?.titulo ?? a.tipo} · ${militar?.nome ?? "militar não informado"} · ${d.indices.length}x`;
  });

  const bloqueadoBase = semAssuntos || totalPend > 0 || (duplicados.length > 0 && !duplicarMesmoAssim);


  const anoDoc = parseInt(rascunho.data_documento.slice(0, 4), 10);
  const transicaoAno = previsto ? anoDoc !== previsto.ano_vigente : false;

  // RF-07 — datas informadas nos assuntos cujo ano diverge do ano do documento.
  const divergenciasAno = rascunho.assuntos.flatMap((a) => {
    const t = templates.find((x) => x.codigo === a.tipo);
    const achados: string[] = [];
    for (const [chave, valor] of Object.entries(a.campos)) {
      if (typeof valor !== "string") continue;
      const m = /^(\d{4})-\d{2}-\d{2}$/.exec(valor.trim());
      if (!m) continue;
      const ano = parseInt(m[1], 10);
      if (Number.isFinite(anoDoc) && ano !== anoDoc) {
        const label = t?.campos.find((c) => c.chave === chave)?.label ?? chave;
        achados.push(`${t?.titulo ?? a.tipo} · ${label}: ${ano}`);
      }
    }
    return achados;
  });

  // Bloco 10D — auditoria pré-geração (somente leitura, nunca altera dados).
  const auditoria = auditarPreGeracao({
    assuntos: rascunho.assuntos.map((a) => {
      const t = templates.find((x) => x.codigo === a.tipo);
      const { texto, ausentes } = textoFinal(a);
      return {
        titulo: t?.titulo ?? a.tipo,
        militar: militares.find((m) => m.id === a.militar_id)?.nome ?? null,
        titular: militares.find((m) => m.id === a.militar_titular_id)?.nome ?? null,
        exigeTitular: a.tipo === "assuncao_funcao" || a.tipo === "dispensa_funcao",
        pendencias: pendencias(a),
        ausentes,
        texto,
      };
    }),
    duplicados: duplicarMesmoAssim ? [] : duplicados,
    divergenciasAno,
    cabecalhoOk: Boolean(rascunho.unidade.nome),
    digitadorOk: Boolean(rascunho.digitador.nome),
    comandanteOk: Boolean(rascunho.comandante.nome),
    numeracaoOk: rascunho.modo_numeracao === "manual"
      ? /\d/.test(rascunho.numero)
      : previsto !== null,
  });

  const bloqueado = bloqueadoBase || auditoria.bloqueado;




  async function handleGerar() {
    if (!documentoId) {
      toast.error("Salve o rascunho antes de gerar.");
      return;
    }
    if (rascunho.modo_numeracao === "manual") {
      const n = parseInt(rascunho.numero.replace(/\D/g, ""), 10);
      if (!Number.isFinite(n) || n < 1) {
        toast.error("Informe o número manual da NBI na Etapa 1.");
        return;
      }
    }
    if (transicaoAno && !confirmarAno && rascunho.modo_numeracao === "automatico") {
      toast.error(`Ano do documento (${anoDoc}) difere do ano vigente (${previsto?.ano_vigente}). Confirme visualmente antes de emitir.`);
      return;
    }
    setGerando(true);
    try {
      const r = await gerar({
        data: {
          documento_id: documentoId,
          confirmar_novo_ano: confirmarAno,
          modo_numeracao: rascunho.modo_numeracao,
          numero_manual: rascunho.modo_numeracao === "manual"
            ? parseInt(rascunho.numero.replace(/\D/g, ""), 10)
            : null,
          ano_manual: rascunho.modo_numeracao === "manual" ? anoDoc : null,
        },
      });
      if (!r.ok) {
        toast.error("Falha ao gerar NBI", { description: r.code });
      } else {
        setGerado({ numero: r.numero ?? 0, ano: r.ano ?? new Date().getFullYear() });
        // Assunções recém-registradas passam a valer para a próxima dispensa.
        void onRecarregarSubstituicoes();

        toast.success(`NBI nº ${String(r.numero ?? 0).padStart(3, "0")}/${r.ano} gerada`);
      }
    } catch (e) {
      toast.error("Falha ao gerar NBI", { description: (e as Error).message });
    } finally {
      setGerando(false);
    }
  }

  async function handleBaixar() {
    if (!documentoId) return;
    try {
      const r = await baixar({ data: { documento_id: documentoId } });
      if (r.ok) window.open(r.url, "_blank");
    } catch (e) {
      toast.error("Erro ao baixar", { description: (e as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conferência</CardTitle>
        <CardDescription>Revise cada assunto. A reserva do número ocorre apenas ao gerar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <div className="font-semibold">
            {gerado
              ? `NBI nº ${String(gerado.numero).padStart(3, "0")}/${gerado.ano}`
              : rascunho.modo_numeracao === "manual"
                ? `NBI nº ${(rascunho.numero || "—").padStart(3, "0")}/${anoDoc} (manual)`
                : `NBI nº (previsto: ${previsto ? String(previsto.proximo).padStart(3, "0") + "/" + previsto.ano_vigente : "…"})`}
            {" · "}{formatarDataBR(rascunho.data_documento)}
          </div>
          <div className="text-muted-foreground">{rascunho.unidade.nome} {rascunho.unidade.sigla && `(${rascunho.unidade.sigla})`}</div>
        </div>

        {transicaoAno && !gerado && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" />
              Transição de ano detectada
            </div>
            <p className="text-xs">
              O ano do documento é <strong>{anoDoc}</strong> e o ano vigente da numeração é <strong>{previsto?.ano_vigente}</strong>.
              {previsto?.reiniciar_anualmente ? " A próxima nota reiniciará em 001." : " A próxima nota manterá a sequência atual."}
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={confirmarAno} onChange={(e) => setConfirmarAno(e.target.checked)} />
              Confirmo a transição de ano.
            </label>
          </div>
        )}

        {/* Duplicidade — bloqueia a emissão até o operador remover o item repetido */}
        {duplicados.length > 0 && !gerado && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Assuntos duplicados nesta NBI
            </div>
            <ul className="list-disc pl-5 text-xs">
              {duplicados.map((d) => <li key={d}>{d}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Os itens acima têm assinatura idêntica (mesmo motor, mesmo militar e mesmos dados que
              identificam o fato). Volte à Etapa 2 e remova a repetição — ou confirme abaixo.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                data-testid="duplicar-mesmo-assim"
                checked={duplicarMesmoAssim}
                onChange={(e) => setDuplicarMesmoAssim(e.target.checked)}
              />
              Duplicar mesmo assim (registrado no snapshot de auditoria)
            </label>
          </div>
        )}

        {/* RF-07 — alerta informativo de ano divergente (não bloqueia a emissão) */}

        {divergenciasAno.length > 0 && !gerado && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Datas com ano diferente do documento ({anoDoc})
            </div>
            <ul className="list-disc pl-5 text-xs">
              {divergenciasAno.map((d) => <li key={d}>{d}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Confira se as datas estão corretas. Situações legítimas (férias iniciadas no ano anterior,
              por exemplo) podem prosseguir normalmente.
            </p>
          </div>
        )}


        {!gerado && <PainelAuditoria resultado={auditoria} />}

        <RevisaoOrtografica
          assuntos={rascunho.assuntos}
          templates={templates}
          militares={militares}
          onAplicar={(assuntoId, chave, novoValor) => atualizarCampo(assuntoId, chave, novoValor)}
        />

        {rascunho.assuntos.map((a, idx) => {
          const t = templates.find((x) => x.codigo === a.tipo);
          if (!t) return null;
          const { texto, ausentes } = textoFinal(a);
          const militar = militares.find((m) => m.id === a.militar_id);
          const pend = pendencias(a);
          const usaFerias = a.tipo === "ferias" || a.tipo === "apresentacao";
          return (
            <div key={a.id} className="rounded-md border p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge>#{idx + 1}</Badge>
                <span className="font-semibold">{t.titulo}</span>
                {pend.length === 0
                  ? <Badge variant="secondary" className="ml-auto"><CheckCircle2 className="mr-1 h-3 w-3" /> Completo</Badge>
                  : <Badge variant="destructive" className="ml-auto"><AlertTriangle className="mr-1 h-3 w-3" /> {pend.length} pendência(s)</Badge>}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{texto}</p>
              <Separator className="my-3" />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>Militar:</strong> {militar ? `${militar.nome} · ID ${militar.matricula ?? "—"}` : "não selecionado"}</p>
                {usaFerias && a.ferias_id && (<p><strong>Datas:</strong> preenchidas a partir do Banco de Férias</p>)}
                {ausentes.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">Placeholders não substituídos: {ausentes.join(", ")}</p>
                )}
                {pend.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-destructive">
                    {pend.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                )}
              </div>
            </div>
          );
        })}

        {bloqueado && !semAssuntos && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" /> {totalPend} pendência(s) — corrija antes de gerar.
            </div>
          </div>
        )}

        {gerado && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            NBI gerada e armazenada com sucesso.
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar e corrigir</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onSalvar} disabled={salvando} data-testid="salvar-rascunho">
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar rascunho
            </Button>
            {!gerado ? (
              <Button
                onClick={handleGerar}
                data-testid="gerar-nbi"
                disabled={bloqueado || gerando || !documentoId || (transicaoAno && !confirmarAno)}
              >
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Gerar NBI (.docx)
              </Button>
            ) : (
              <Button onClick={handleBaixar} data-testid="baixar-nbi">
                <FileText className="mr-2 h-4 w-4" /> Baixar NBI (.docx)
              </Button>
            )}
          </div>
        </div>
        {!documentoId && (
          <p className="text-xs text-muted-foreground">Salve o rascunho ao menos uma vez para habilitar a geração.</p>
        )}
        {motivoCancelamento && <p className="text-xs">{motivoCancelamento}</p>}
      </CardContent>
    </Card>
  );
}


// ============ REVISÃO ORTOGRÁFICA (pré-conferência) ============
// Bloco 10C — regras de estabilidade:
//  * derivação 100% pura (nenhum setState durante render / nenhum efeito
//    que grave rascunho, snapshot ou banco);
//  * o dicionário só é carregado quando existe pelo menos um campo livre
//    preenchido — e o carregamento agora roda em Web Worker;
//  * a lista é memoizada por (assuntos, templates, dicionário, ignoradas);
//  * nenhuma sugestão é aplicada automaticamente: o operador escolhe.
function RevisaoOrtografica({
  assuntos, templates, militares, onAplicar,
}: {
  assuntos: AssuntoLocal[];
  templates: TemplateRow[];
  militares: MilitarNbi[];
  onAplicar: (assuntoId: string, chave: string, novoValor: string) => void;
}) {
  const [ignoradas, setIgnoradas] = useState<Set<string>>(new Set());

  // Campos derivados/automáticos e textos oficiais nunca são revisados.
  const CHAVES_DERIVADAS = [
    "NOME", "ID_FUNC", "LOTACAO", "POSTO_QUADRO", "ARTIGO_O_A", "ARTIGO_AO_A",
    "NOME_TITULAR", "ID_FUNC_TITULAR", "LOTACAO_TITULAR", "POSTO_QUADRO_TITULAR",
    "QTD_DIAS_EXTENSO", "TERMINACAO_RETORNO", "PERIODO", "ANO",
  ];

  // Etapa pura 1 — quais campos livres existem e valem revisão.
  const campos = useMemo(() => {
    const out: Array<{ assuntoId: string; titulo: string; chave: string; label: string; valor: string }> = [];
    for (const a of assuntos) {
      const t = templates.find((x) => x.codigo === a.tipo);
      if (!t) continue;
      for (const c of t.campos) {
        if (c.tipo !== "texto" && c.tipo !== "texto_longo") continue;
        if (CHAVES_DERIVADAS.includes(c.chave)) continue;
        const v = String(a.campos[c.chave] ?? "");
        if (!v.trim()) continue;
        out.push({ assuntoId: a.id, titulo: t.titulo, chave: c.chave, label: c.label, valor: v });
      }
    }
    return out;
  }, [assuntos, templates]);

  // O dicionário só é buscado se houver algo a revisar.
  const { spell } = useSpellchecker(campos.length > 0);

  const dicionarioExtras = useMemo(() => montarDicionarioDinamico({
    militaresNome: militares.map((m) => m.nome),
    militaresNomeGuerra: militares.map((m) => m.nome_guerra),
    lotacoes: militares.map((m) => m.lotacao_nbi),
  }), [militares]);

  // Etapa pura 2 — sugestões. Sem efeitos colaterais, sem persistência.
  const itens = useMemo(() => {
    const out: Array<{
      assuntoId: string;
      titulo: string;
      chave: string;
      label: string;
      valor: string;
      sugestoes: ReturnType<typeof sugestoesTexto>;
    }> = [];
    for (const c of campos) {
      const s = sugestoesTexto(c.valor, spell, { extras: dicionarioExtras, ignoradas });
      if (s.length === 0) continue;
      out.push({ ...c, sugestoes: s });
    }
    return out;
  }, [campos, spell, dicionarioExtras, ignoradas]);

  if (itens.length === 0) return null;


  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" /> Possíveis correções ortográficas
      </div>
      <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
        Confirme cada sugestão antes de gerar. Nomes próprios não listados no dicionário podem ser mantidos como digitados.
      </p>
      <div className="space-y-2">
        {itens.map((it) => (
          <div key={`${it.assuntoId}-${it.chave}`} className="rounded border border-amber-200 bg-background p-2 dark:border-amber-800">
            <div className="text-xs font-medium">{it.titulo} · {it.label}</div>
            <div className="mt-1 space-y-1">
              {it.sugestoes.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1">"<strong>{s.original}</strong>" → "<strong>{s.correcao}</strong>"</span>
                  <Button
                    type="button" size="sm" variant="outline" className="h-6 px-2"
                    onClick={() => onAplicar(it.assuntoId, it.chave, aplicarSugestaoTexto(it.valor, s))}
                  >
                    Aplicar sugestão
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost" className="h-6 px-2"
                    onClick={() => setIgnoradas((prev) => {
                      const n = new Set(prev); n.add(s.original.toLowerCase()); return n;
                    })}
                  >
                    Manter como digitado
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Motivo controlado (Assunção/Dispensa) ============
// Bloco 8C: o rótulo da interface NUNCA vai para a frase. O valor gravado é
// sempre o texto oficial do motivo (texto_assuncao / texto_dispensa).
export function MotivoTitularField({
  chave, testId, label, obrigatorio, valor, onChange, contexto,
}: {
  chave: string;
  testId?: string;
  label: string;
  obrigatorio: boolean;
  valor: string;
  onChange: (v: string) => void;
  contexto: "afastamento" | "retorno";
}) {
  const conhecido = motivoPorTexto(valor, contexto);
  const isOutro = valor !== "" && !conhecido;
  const [modo, setModo] = useState<"lista" | "outro">(isOutro ? "outro" : "lista");
  const [aberto, setAberto] = useState(false);
  const preview = contexto === "afastamento"
    ? `…encontrar-se em ${valor || "…"}.`
    : `…retornou de ${valor || "…"}.`;
  return (
    <div className="rounded-md border p-3">
      <Label>{label}{obrigatorio && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-2 grid gap-2">
        <Select
          open={aberto}
          onOpenChange={setAberto}
          value={modo === "outro" ? "__outro__" : (conhecido?.id ?? "")}
          onValueChange={(v) => {
            if (v === "__outro__") { setModo("outro"); onChange(""); return; }
            setModo("lista");
            onChange(textoMotivo(v, contexto) ?? "");
          }}
        >
          <SelectTrigger
            data-testid={testId ? `${testId}-trigger` : undefined}
            onClick={() => setAberto(true)}
          >
            <SelectValue placeholder="Selecionar motivo" />
          </SelectTrigger>
          <SelectContent data-testid={testId ? `${testId}-options` : undefined}>
            {MOTIVOS_FUNCAO.map((o) => (
              <SelectItem key={o.id} value={o.id} data-testid={testId ? `${testId}-option-${idMotivoTeste(o.id)}` : undefined}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value="__outro__" data-testid={testId ? `${testId}-option-outro` : undefined}>— Outro (texto livre) —</SelectItem>
          </SelectContent>
        </Select>
        {modo === "outro" && (
          <Input
            data-testid={testId ? `${testId}-livre` : undefined}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            placeholder='Ex.: "licença para tratamento de saúde" (somente a expressão que entra na frase)'
          />
        )}
        <p className="text-[11px] text-muted-foreground">
          Chave interna: <code>{chave}</code> · frase resultante: <em>{preview}</em>
        </p>
      </div>
    </div>
  );
}

function idMotivoTeste(id: string): string {
  if (id === "paternidade") return "licenca-paternidade";
  if (id === "lts") return "licenca";
  return id;
}

// ============ Origem dos dados de Assunção/Dispensa (Bloco 8C) ============
function OrigemDadosFuncao({
  assunto, militares, ferias, substituicoes, onRecarregarSubstituicoes, anoNbi, onChange, onCampo,
}: {
  assunto: AssuntoLocal;
  militares: MilitarNbi[];
  ferias: FeriasReg[];
  substituicoes: SubstituicaoAberta[];
  onRecarregarSubstituicoes: () => Promise<void> | void;

  anoNbi: number;
  onChange: (patch: Partial<AssuntoLocal>) => void;
  onCampo: (chave: string, v: string | boolean) => void;
}) {
  const ehAssuncao = assunto.tipo === "assuncao_funcao";
  const origem = assunto.origem_dados ?? "manual";
  const titular = militares.find((m) => m.id === assunto.militar_titular_id) ?? null;
  const nomeDe = (id: string | null) => {
    const m = militares.find((x) => x.id === id);
    return m ? `${m.posto_graduacao ?? ""} ${m.nome}`.trim() : "—";
  };

  const periodos = useMemo(
    () => ferias
      .filter((f) => f.militar_id === assunto.militar_titular_id && f.ano === anoNbi)
      .sort((a, b) => a.periodo - b.periodo),
    [ferias, assunto.militar_titular_id, anoNbi],
  );

  function aplicarFerias(f: FeriasReg) {
    onChange({ ferias_id: f.id });
    if (ehAssuncao) {
      onCampo("DATA_INICIO", f.data_inicio);
      onCampo("MOTIVO_TITULAR", TEXTO_FERIAS);
      onCampo("DATA_DISPENSA_PREVISTA", somarDiasISO(f.data_fim, 1));
      if (titular && !String(assunto.campos.FUNCAO_ASSUMIDA ?? "")) {
        const fx = funcaoDocumentalDe(titular);
        if (fx) onCampo("FUNCAO_ASSUMIDA", fx);
      }
    } else {
      onCampo("DATA_INICIO", somarDiasISO(f.data_fim, 1));
      onCampo("MOTIVO_RETORNO", TEXTO_FERIAS);
      if (titular && !String(assunto.campos.FUNCAO_DISPENSADA ?? "")) {
        const fx = funcaoDocumentalDe(titular);
        if (fx) onCampo("FUNCAO_DISPENSADA", fx);
      }
    }
    toast.success(`Período ${periodoOrdinal(f.periodo)} aplicado — confira a data antes de gerar.`);
  }

  function aplicarSubstituicao(s: SubstituicaoAberta) {
    // Função é reaproveitada EXATAMENTE como congelada na Assunção original.
    onChange({
      substituicao_id: s.id,
      militar_id: s.substituto_militar_id ?? assunto.militar_id,
      militar_titular_id: s.titular_militar_id ?? assunto.militar_titular_id,
    });
    if (s.funcao) onCampo("FUNCAO_DISPENSADA", s.funcao);
    if (s.motivo) onCampo("MOTIVO_RETORNO", s.motivo);
    // Data de dispensa: prevista na assunção ou, na falta dela, derivada do
    // período de férias do titular (dia seguinte ao término).
    // Prioridade obrigatória (Bloco 10C):
    // 1) data_fim_prevista da substituição → 2) férias do titular + 1 dia
    // → 3) snapshot da assunção → 4) manual.
    const r = resolverDataDispensa(
      {
        id: s.id,
        titular_militar_id: s.titular_militar_id ?? null,
        data_inicio: s.data_inicio ?? null,
        data_fim_prevista: s.data_fim_prevista ?? null,
      },
      ferias.map((f) => ({ militar_id: f.militar_id, data_inicio: f.data_inicio, data_fim: f.data_fim })),
      null,
    );
    if (r.valor) onCampo("DATA_INICIO", r.valor);
    // Registrada a origem para exibição no CampoDerivado e no snapshot.
    onCampo("__ORIGEM_DATA_DISPENSA", r.detalhe);
    toast.success(
      r.valor
        ? `Assunção vinculada — data de dispensa por ${r.origem.toLowerCase()}.`
        : "Assunção vinculada — informe manualmente a data de dispensa.",
    );
  }


  const opcoes: Array<{ v: NonNullable<AssuntoLocal["origem_dados"]>; label: string }> = ehAssuncao
    ? [
      { v: "ferias", label: "Férias cadastradas" },
      { v: "manual", label: "Preenchimento manual" },
    ]
    : [
      { v: "assuncao", label: "Assunção anterior" },
      { v: "ferias", label: "Férias cadastradas" },
      { v: "manual", label: "Preenchimento manual" },
    ];

  return (
    <div className="mb-3 rounded-md border border-dashed p-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Origem dos dados</Label>
      <div className="mt-2 flex flex-wrap gap-4">
        {opcoes.map((o) => (
          <label key={o.v} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              data-testid={`assunto-${assunto.id}-origem-${o.v}`}
              name={`origem-${assunto.id}`}
              checked={origem === o.v}
              onChange={() => onChange({ origem_dados: o.v, substituicao_id: o.v === "assuncao" ? assunto.substituicao_id ?? null : null })}
            />
            {o.label}
          </label>
        ))}
      </div>

      {origem === "ferias" && (
        <div className="mt-3 space-y-2">
          {!assunto.militar_titular_id ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Selecione o titular acima para consultar os períodos de férias cadastrados.
            </p>
          ) : periodos.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Nenhum período de férias cadastrado para {nomeDe(assunto.militar_titular_id)} em {anoNbi}.
              Use o preenchimento manual ou cadastre o plano de férias.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                {periodos.length > 1
                  ? "Mais de um período encontrado — confirme qual deve ser usado."
                  : "Confirme o período antes de aplicar."}
              </p>
              {periodos.map((f) => {
                const dias = diasEntreISO(f.data_inicio, f.data_fim);
                const ativo = assunto.ferias_id === f.id;
                return (
                  <div key={f.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs ${ativo ? "border-primary bg-primary/5" : "border-border"}`}>
                    <span>
                      <strong>{periodoOrdinal(f.periodo)} período/{f.ano}</strong>
                      {" · "}{formatarDataBR(f.data_inicio)} a {formatarDataBR(f.data_fim)}
                      {" · "}{dias} dia{dias === 1 ? "" : "s"}
                      {" · "}dispensa prevista em {formatarDataBR(somarDiasISO(f.data_fim, 1))}
                    </span>
                    <Button type="button" size="sm" variant={ativo ? "secondary" : "outline"} onClick={() => aplicarFerias(f)}>
                      {ativo ? "Reaplicar" : "Confirmar este período"}
                    </Button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {origem === "assuncao" && !ehAssuncao && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {substituicoes.length === 0
                ? "Nenhuma assunção em aberto encontrada."
                : `${substituicoes.length} assunção(ões) de função em aberto.`}
            </p>
            <Button type="button" size="sm" variant="ghost" data-testid={`assunto-${assunto.id}-atualizar-substituicoes`} onClick={() => void onRecarregarSubstituicoes()}>
              Atualizar lista
            </Button>
          </div>
          {substituicoes.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Assunções só entram nesta lista após a NBI correspondente ser gerada.
              Use férias cadastradas ou preenchimento manual.
            </p>
          ) : (

            substituicoes.map((s) => {
              const ativo = assunto.substituicao_id === s.id;
              return (
                <div
                  key={s.id}
                  data-testid={`substituicao-aberta-${s.id}`}
                  className={`rounded border p-3 text-xs ${ativo ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Substituto</p>
                      <p className="font-semibold">{nomeDe(s.substituto_militar_id)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Titular</p>
                      <p className="font-semibold">{nomeDe(s.titular_militar_id)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Função</p>
                      <p>{s.funcao || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Período</p>
                      <p>
                        Assunção: {s.data_inicio ? formatarDataBR(s.data_inicio) : "—"}
                        <br />
                        Dispensa prevista:{" "}
                        {s.data_fim_prevista
                          ? formatarDataBR(s.data_fim_prevista)
                          : "Sem previsão automática"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</p>
                      <p>{s.assuncao?.numero ? `NBI nº ${s.assuncao.numero}/${s.assuncao.ano ?? ""}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
                      <p>
                        Aberta
                        {!s.data_fim_prevista && (
                          <span className="block text-[10px] text-muted-foreground">
                            Data será informada após a seleção
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button type="button" size="sm" variant={ativo ? "secondary" : "outline"} data-testid={`usar-substituicao-${s.id}`} onClick={() => aplicarSubstituicao(s)}>
                      {ativo ? "Vinculada" : "Usar esta assunção"}
                    </Button>
                  </div>
                </div>
              );
            })

          )}
          {assunto.substituicao_id && (
            <p className="text-[11px] text-muted-foreground">
              A função dispensada vem congelada da assunção original e não é recomposta pelo cadastro atual.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ============ Composição de função (Assunção/Dispensa) ============
function FuncaoComposta({
  chave, testId, label, obrigatorio, valor, titular, onChange, extraWords,
}: {
  chave: string;
  testId?: string;
  label: string;
  obrigatorio: boolean;
  valor: string;
  titular: MilitarNbi | null;
  onChange: (v: string) => void;
  extraWords: Set<string>;
}) {
  // Prioridade: função documental cadastrada; se vazia, composição automática.
  function componer() {
    if (!titular) return;
    const composto = funcaoDocumentalDe(titular);
    if (composto) onChange(composto);
  }
  function montarAutomatico() {
    if (!titular) return;
    const composto = comporFuncaoDocumental(titular);
    if (composto) onChange(composto);
  }
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}{obrigatorio && <span className="text-destructive"> *</span>}</Label>
        {titular && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={componer}>
              Usar função documental do titular
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={montarAutomatico}>
              Montar função automaticamente
            </Button>
          </div>
        )}
      </div>
      <div className="mt-2">
        <CampoLivreCorrigido
          testId={testId}
          value={valor}
          onChange={onChange}
          extraWords={extraWords}
          capitalizacao="inicial"
          placeholder='Ex.: "2ºSGT do 2ºGBM/1ºPelBM/1ªCiaBM/12ºBBM IJUÍ"'
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Chave interna: <code>{chave}</code>. Nunca usar nome do militar como função.
        </p>
      </div>
    </div>
  );
}
