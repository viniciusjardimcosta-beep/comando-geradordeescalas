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
import {
  Loader2, Save, ArrowLeft, ArrowRight, Plus, Trash2, ChevronUp, ChevronDown,
  Wand2, AlertTriangle, CheckCircle2, FileText,
} from "lucide-react";
import {
  type AssuntoTipo, type MilitarNbi, type FeriasReg,
  numeroPorExtenso, periodoOrdinal, analisarFraseNbi, postoMilitarCombina,
  normalizarTextoNbi,
  montarPostoQuadro, artigoO, artigoAo,
  somarDiasISO, diasEntreISO, formatarDataBR, interpolarTexto,
} from "@/utils/nbi";
import { CODIGOS_HOMOLOGADOS } from "@/utils/nbi-categorias";
import { AssuntoPicker, type TemplatePickable } from "@/components/nbi/AssuntoPicker";
import { CampoLivreCorrigido } from "@/components/nbi/CampoLivreCorrigido";
import { montarDicionarioDinamico } from "@/utils/nbi-dicionario";

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
  campos: Record<string, string | boolean>;
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

  async function carregar(uid: string, rascId: string | null) {
    setLoading(true);
    try {
      const [tpl, mil, fer, cfg] = await Promise.all([
        supabase.from("nbi_templates").select("id,codigo,titulo,titulo_documento,disponivel,ordem,texto_modelo,campos").order("ordem"),
        supabase.from("militares").select("id,nome,nome_guerra,posto_graduacao,matricula,quadro,lotacao_nbi,funcao_atual,genero_gramatical").eq("user_id", uid).eq("ativo", true).order("nome"),
        supabase.from("ferias_militares").select("id,militar_id,ano,periodo,data_inicio,data_fim").eq("user_id", uid),
        supabase.from("nbi_settings").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      if (tpl.data) setTemplates(tpl.data as unknown as TemplateRow[]);
      if (mil.data) setMilitares(mil.data as MilitarNbi[]);
      if (fer.data) setFerias(fer.data as FeriasReg[]);
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
    }
    setRascunho((r) => ({
      ...r,
      assuntos: [...r.assuntos, {
        id: uid(),
        tipo: codigo as AssuntoTipo,
        militar_id: null,
        militar_titular_id: null,
        ferias_id: null,
        campos,
      }],
    }));
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

  // Resolve valores finais do assunto (apenas em memória, não altera texto oficial).
  function resolverValores(a: AssuntoLocal): Record<string, string> {
    const t = templatePor.get(a.tipo);
    if (!t) return {};
    const militar = militares.find((m) => m.id === a.militar_id) ?? null;
    const titular = militares.find((m) => m.id === a.militar_titular_id) ?? null;
    const v: Record<string, string> = {};
    for (const c of t.campos) {
      const bruto = a.campos[c.chave];
      if (bruto !== undefined && bruto !== "" && typeof bruto !== "boolean") {
        v[c.chave] = String(bruto);
      }
    }
    if (militar) {
      if (!v.NOME) v.NOME = militar.nome;
      if (!v.ID_FUNC) v.ID_FUNC = militar.matricula ?? "";
      if (!v.LOTACAO) v.LOTACAO = militar.lotacao_nbi ?? "";
      if (!v.POSTO_QUADRO) v.POSTO_QUADRO = montarPostoQuadro(militar.posto_graduacao, militar.quadro);
      v.ARTIGO_O_A = artigoO(militar.genero_gramatical);
      v.ARTIGO_AO_A = artigoAo(militar.genero_gramatical);
    }
    if (titular) {
      v.NOME_TITULAR = titular.nome;
      v.ID_FUNC_TITULAR = titular.matricula ?? "";
      v.LOTACAO_TITULAR = titular.lotacao_nbi ?? "";
      v.POSTO_QUADRO_TITULAR = montarPostoQuadro(titular.posto_graduacao, titular.quadro);
      v.ARTIGO_O_A_TITULAR = artigoO(titular.genero_gramatical);
    }
    // autos
    if (v.DATA_INICIO && v.DATA_FIM && !v.QTD_DIAS) {
      const n = diasEntreISO(v.DATA_INICIO, v.DATA_FIM);
      v.QTD_DIAS = String(n);
    }
    if (v.DATA_INICIO && !v.DATA_FIM && v.QTD_DIAS) {
      const n = parseInt(v.QTD_DIAS, 10);
      if (!Number.isNaN(n) && n > 0) v.DATA_FIM = somarDiasISO(v.DATA_INICIO, n - 1);
    }
    if (v.QTD_DIAS && !v.QTD_DIAS_EXTENSO) {
      const n = parseInt(v.QTD_DIAS, 10);
      if (!Number.isNaN(n)) v.QTD_DIAS_EXTENSO = numeroPorExtenso(n);
    }
    if (v.DATA_FIM && !v.DATA_APRESENTACAO) {
      v.DATA_APRESENTACAO = somarDiasISO(v.DATA_FIM, 1);
    }
    if (v.DATA_INICIO && !v.ANO) {
      v.ANO = v.DATA_INICIO.slice(0, 4);
    }
    if (v.PERIODO && /^\d+$/.test(v.PERIODO)) {
      v.PERIODO = periodoOrdinal(parseInt(v.PERIODO, 10));
    }
    // viagem
    if (a.tipo === "viagem") {
      const mesmoDia = Boolean(a.campos.retorno_no_mesmo_dia);
      v.TERMINACAO_RETORNO = mesmoDia
        ? "retornando no mesmo dia"
        : (v.DATA_RETORNO ? `retornando em ${formatarDataBR(v.DATA_RETORNO)}` : "");
    }
    // formatação de datas visíveis
    for (const k of ["DATA_INICIO", "DATA_FIM", "DATA_APRESENTACAO", "DATA_RETORNO"]) {
      if (v[k] && /^\d{4}-\d{2}-\d{2}$/.test(v[k])) v[k] = formatarDataBR(v[k]);
    }
    return v;
  }

  function textoFinal(a: AssuntoLocal): { texto: string; ausentes: string[] } {
    const t = templatePor.get(a.tipo);
    if (!t) return { texto: "", ausentes: [] };
    return interpolarTexto(t.texto_modelo, resolverValores(a));
  }

  // Pendências bloqueantes por assunto — verifica campos cadastrais do militar
  // e campos do próprio assunto. Retorna motivos legíveis, em português.
  function pendencias(a: AssuntoLocal): string[] {
    const t = templatePor.get(a.tipo);
    if (!t) return ["template não encontrado"];
    const out: string[] = [];
    const militar = militares.find((m) => m.id === a.militar_id) ?? null;
    const titular = militares.find((m) => m.id === a.militar_titular_id) ?? null;

    // exige seleção de militar sempre
    if (!militar) out.push("militar não selecionado");
    if (a.tipo === "dispensa_funcao" && !titular) out.push("titular não selecionado");

    // dados cadastrais NBI do militar (obrigatórios em todos os templates)
    if (militar) {
      if (!militar.matricula) out.push(`ID FUNC/matrícula ausente no cadastro de ${militar.nome}`);
      if (!militar.posto_graduacao) out.push(`posto/graduação ausente no cadastro de ${militar.nome}`);
      if (!militar.quadro) out.push(`quadro ausente no cadastro NBI de ${militar.nome}`);
      if (!militar.lotacao_nbi) out.push(`lotação NBI ausente no cadastro de ${militar.nome}`);
      if (!militar.genero_gramatical) out.push(`gênero gramatical ausente no cadastro de ${militar.nome}`);
    }
    if (a.tipo === "dispensa_funcao" && titular) {
      if (!titular.matricula) out.push(`ID FUNC do titular ${titular.nome} ausente`);
      if (!titular.posto_graduacao) out.push(`posto do titular ${titular.nome} ausente`);
      if (!titular.quadro) out.push(`quadro do titular ${titular.nome} ausente`);
      if (!titular.lotacao_nbi) out.push(`lotação NBI do titular ${titular.nome} ausente`);
      if (!titular.genero_gramatical) out.push(`gênero gramatical do titular ${titular.nome} ausente`);
    }

    // campos do template
    const auto = new Set(["QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO", "ANO", "TERMINACAO_RETORNO", "ARTIGO_O_A", "ARTIGO_AO_A", "ARTIGO_O_A_TITULAR"]);
    const derivadosMilitar = new Set(["NOME", "ID_FUNC", "LOTACAO", "POSTO_QUADRO", "NOME_TITULAR", "ID_FUNC_TITULAR", "LOTACAO_TITULAR", "POSTO_QUADRO_TITULAR"]);
    for (const c of t.campos) {
      if (auto.has(c.chave) || derivadosMilitar.has(c.chave)) continue;
      const val = a.campos[c.chave];
      // regras especiais
      if (c.chave === "DATA_RETORNO") {
        const mesmoDia = Boolean(a.campos.retorno_no_mesmo_dia);
        if (!mesmoDia && (!val || val === "")) out.push(`${c.label}: obrigatório quando não há retorno no mesmo dia`);
        continue;
      }
      if (c.tipo === "boolean") continue;
      if (c.obrigatorio && (val === undefined || val === null || val === "")) {
        out.push(`${c.label} ausente`);
      }
    }

    // férias/apresentação: datas coerentes (fim pode ser derivado de qtd_dias)
    if (a.tipo === "ferias" || a.tipo === "apresentacao") {
      const resolvidos = resolverValores(a);
      const ini = resolvidos.DATA_INICIO;
      const fim = resolvidos.DATA_FIM;
      if (a.tipo === "ferias") {
        if (!ini) out.push("data de início do período de férias ausente");
        if (!fim) out.push("informe a quantidade de dias ou a data fim das férias");
      }
      if (a.tipo === "apresentacao" && !resolvidos.DATA_APRESENTACAO && !fim) {
        out.push("data de apresentação ausente");
      }
    }
    return out;
  }

  async function salvarRascunho() {
    if (!userId) return;
    setSalvando(true);
    try {
      const snapshot = rascunho.assuntos.map((a) => {
        const t = templatePor.get(a.tipo);
        const { texto, ausentes } = textoFinal(a);
        return {
          tipo: a.tipo,
          template_codigo: t?.codigo ?? a.tipo,
          titulo: t?.titulo ?? a.tipo,
          titulo_documento:
            (t as unknown as { titulo_documento?: string | null } | undefined)?.titulo_documento ??
            (t?.titulo ?? a.tipo).toUpperCase(),
          militar_id: a.militar_id,
          militar_titular_id: a.militar_titular_id,
          ferias_id: a.ferias_id,
          campos: a.campos,
          texto_final: texto,
          campos_ausentes: ausentes,
          pendencias: pendencias(a),
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
          onBack={() => setEtapa(2)}
          onSalvar={salvarRascunho}
          salvando={salvando}
          documentoId={documentoId}
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
  rascunho, templates, militares, ferias,
  adicionar, atualizar, atualizarCampo, remover, mover,
  onBack, onNext,
}: {
  rascunho: Rascunho;
  templates: TemplateRow[];
  militares: MilitarNbi[];
  ferias: FeriasReg[];
  adicionar: (t: AssuntoTipo) => void;
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
              anoNbi={parseInt(rascunho.data_documento.slice(0, 4), 10) || rascunho.ano}
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
            />
            <span className="text-xs text-muted-foreground">
              Pesquise por nome, título oficial ou categoria.
            </span>
          </div>
        )}


        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={onNext} disabled={rascunho.assuntos.length === 0}>Ir para conferência <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssuntoCard({
  index, assunto, template, militares, ferias, anoNbi,
  onChange, onCampo, onRemove, onUp, onDown,
}: {
  index: number;
  assunto: AssuntoLocal;
  template: TemplateRow;
  militares: MilitarNbi[];
  ferias: FeriasReg[];
  anoNbi: number;
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
    <div className="rounded-md border border-border p-4">
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
          <SelectTrigger><SelectValue placeholder="Selecionar militar" /></SelectTrigger>
          <SelectContent>
            {militares.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.posto_graduacao ?? ""} {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assunto.tipo === "dispensa_funcao" && (
        <div className="mb-3">
          <Label>Militar titular (que retornou)</Label>
          <Select value={assunto.militar_titular_id ?? ""} onValueChange={(v) => onChange({ militar_titular_id: v || null })}>
            <SelectTrigger><SelectValue placeholder="Selecionar titular" /></SelectTrigger>
            <SelectContent>
              {militares.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.posto_graduacao ?? ""} {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {template.campos
          .filter((c) => !["NOME", "ID_FUNC", "LOTACAO", "POSTO_QUADRO", "ARTIGO_O_A", "ARTIGO_AO_A", "NOME_TITULAR", "ID_FUNC_TITULAR", "LOTACAO_TITULAR", "POSTO_QUADRO_TITULAR", "QTD_DIAS_EXTENSO", "TERMINACAO_RETORNO"].includes(c.chave))
          .map((c) => {
            const val = assunto.campos[c.chave];
            if (c.tipo === "boolean") {
              return (
                <label key={c.chave} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => onCampo(c.chave, e.target.checked)}
                  />
                  {c.label}
                </label>
              );
            }
            const inputType = c.tipo === "data" ? "date" : c.tipo === "inteiro" ? "number" : "text";
            if (c.tipo === "texto_longo") {
              return (
                <div key={c.chave} className="md:col-span-2">
                  <Label>{c.label}</Label>
                  <Textarea value={String(val ?? "")} onChange={(e) => onCampo(c.chave, e.target.value)} rows={2} />
                </div>
              );
            }
            return (
              <div key={c.chave}>
                <Label>{c.label}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
                <Input type={inputType} value={String(val ?? "")} onChange={(e) => onCampo(c.chave, e.target.value)} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ============ ETAPA 3 ============

function Etapa3({
  rascunho, templates, militares, textoFinal, pendencias, onBack, onSalvar, salvando,
  documentoId,
}: {
  rascunho: Rascunho;
  templates: TemplateRow[];
  militares: MilitarNbi[];
  textoFinal: (a: AssuntoLocal) => { texto: string; ausentes: string[] };
  pendencias: (a: AssuntoLocal) => string[];
  onBack: () => void;
  onSalvar: () => Promise<void> | void;
  salvando: boolean;
  documentoId: string | null;
}) {
  const gerar = useServerFn(gerarNbi);
  const baixar = useServerFn(baixarNbi);
  const prox = useServerFn(proximoNumeroPrevisto);

  const [gerando, setGerando] = useState(false);
  const [gerado, setGerado] = useState<{ numero: number; ano: number } | null>(null);
  const [confirmarAno, setConfirmarAno] = useState(false);
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
  const bloqueado = semAssuntos || totalPend > 0;

  const anoDoc = parseInt(rascunho.data_documento.slice(0, 4), 10);
  const transicaoAno = previsto ? anoDoc !== previsto.ano_vigente : false;

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
            <Button variant="outline" onClick={onSalvar} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar rascunho
            </Button>
            {!gerado ? (
              <Button
                onClick={handleGerar}
                disabled={bloqueado || gerando || !documentoId || (transicaoAno && !confirmarAno)}
              >
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Gerar NBI (.docx)
              </Button>
            ) : (
              <Button onClick={handleBaixar}>
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

