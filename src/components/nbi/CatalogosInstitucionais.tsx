// Bloco 10E — Catálogos institucionais (siglas, fundamentos) e estado de
// homologação dos modelos. Tudo é cadastrado pelo usuário: o sistema não
// inventa descrição oficial nem fundamento legal.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookMarked, Gavel, ShieldCheck, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SiglaInstitucional, ModoFormaDocumental } from "@/lib/nbi/siglas";
import type { FundamentoLegal } from "@/lib/nbi/fundamentos";
import { rotuloEstado, normalizarEstado } from "@/lib/nbi/homologacao";

interface TemplateEstado {
  id: string;
  codigo: string;
  titulo: string;
  subtipo: string | null;
  versao: number | null;
  estado_homologacao: string | null;
}

export function CatalogosInstitucionais() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [siglas, setSiglas] = useState<SiglaInstitucional[]>([]);
  const [fundamentos, setFundamentos] = useState<FundamentoLegal[]>([]);
  const [templates, setTemplates] = useState<TemplateEstado[]>([]);

  const [novaSigla, setNovaSigla] = useState({ sigla: "", descricao_oficial: "", forma_documental: "", modo: "sigla" as ModoFormaDocumental });
  const [novoFund, setNovoFund] = useState({ codigo_assunto: "", titulo: "", texto_oficial: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const [sg, fd, tp] = await Promise.all([
        supabase.from("nbi_siglas_institucionais")
          .select("id,sigla,descricao_oficial,forma_documental,categoria,ativo,modo")
          .eq("user_id", uid).order("sigla"),
        supabase.from("nbi_fundamentos")
          .select("id,codigo_assunto,titulo,texto_oficial,ativo,padrao")
          .eq("user_id", uid).order("codigo_assunto"),
        supabase.from("nbi_templates")
          .select("id,codigo,titulo,subtipo,versao,estado_homologacao").order("ordem"),
      ]);
      if (sg.data) setSiglas(sg.data as unknown as SiglaInstitucional[]);
      if (fd.data) setFundamentos(fd.data as unknown as FundamentoLegal[]);
      if (tp.data) setTemplates(tp.data as unknown as TemplateEstado[]);
      setLoading(false);
    })();
  }, [uid]);

  async function adicionarSigla() {
    if (!uid) return;
    if (!novaSigla.sigla.trim() || !novaSigla.descricao_oficial.trim()) {
      toast.error("Informe a sigla e a descrição oficial");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.from("nbi_siglas_institucionais").insert({
      user_id: uid,
      sigla: novaSigla.sigla.trim(),
      descricao_oficial: novaSigla.descricao_oficial.trim(),
      forma_documental: novaSigla.forma_documental.trim() || null,
      modo: novaSigla.modo,
    }).select("id,sigla,descricao_oficial,forma_documental,categoria,ativo,modo").single();
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar a sigla"); return; }
    setSiglas((p) => [...p, data as unknown as SiglaInstitucional]);
    setNovaSigla({ sigla: "", descricao_oficial: "", forma_documental: "", modo: "sigla" });
    toast.success("Sigla cadastrada");
  }

  async function removerSigla(id?: string) {
    if (!id) return;
    const { error } = await supabase.from("nbi_siglas_institucionais").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover"); return; }
    setSiglas((p) => p.filter((s) => s.id !== id));
  }

  async function adicionarFundamento() {
    if (!uid) return;
    if (!novoFund.codigo_assunto || !novoFund.titulo.trim() || !novoFund.texto_oficial.trim()) {
      toast.error("Informe assunto, título e o texto oficial do fundamento");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.from("nbi_fundamentos").insert({
      user_id: uid,
      codigo_assunto: novoFund.codigo_assunto,
      titulo: novoFund.titulo.trim(),
      texto_oficial: novoFund.texto_oficial.trim(),
    }).select("id,codigo_assunto,titulo,texto_oficial,ativo,padrao").single();
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar o fundamento"); return; }
    setFundamentos((p) => [...p, data as unknown as FundamentoLegal]);
    setNovoFund({ codigo_assunto: "", titulo: "", texto_oficial: "" });
    toast.success("Fundamento cadastrado");
  }

  async function alternarPadrao(f: FundamentoLegal) {
    const { error } = await supabase.from("nbi_fundamentos")
      .update({ padrao: !f.padrao }).eq("id", f.id);
    if (error) { toast.error("Não foi possível atualizar"); return; }
    setFundamentos((p) => p.map((x) => (x.id === f.id ? { ...x, padrao: !f.padrao } : x)));
  }

  async function removerFundamento(id: string) {
    const { error } = await supabase.from("nbi_fundamentos").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover"); return; }
    setFundamentos((p) => p.filter((f) => f.id !== id));
  }

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogos institucionais…
      </CardContent></Card>
    );
  }

  const emHomologacao = templates.filter(
    (t) => normalizarEstado(t.estado_homologacao) !== "homologado",
  );

  return (
    <>
      <Card data-testid="card-siglas">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Catálogo de siglas institucionais</CardTitle>
          </div>
          <CardDescription>
            Siglas não cadastradas são preservadas exatamente como digitadas. O sistema
            nunca inventa a descrição por extenso — ela só aparece no documento se você
            cadastrar e escolher essa forma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_150px_auto]">
            <Input placeholder="Sigla" value={novaSigla.sigla}
              onChange={(e) => setNovaSigla({ ...novaSigla, sigla: e.target.value })} />
            <Input placeholder="Descrição oficial" value={novaSigla.descricao_oficial}
              onChange={(e) => setNovaSigla({ ...novaSigla, descricao_oficial: e.target.value })} />
            <Input placeholder="Forma personalizada (opcional)" value={novaSigla.forma_documental}
              onChange={(e) => setNovaSigla({ ...novaSigla, forma_documental: e.target.value })} />
            <Select value={novaSigla.modo}
              onValueChange={(v) => setNovaSigla({ ...novaSigla, modo: v as ModoFormaDocumental })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sigla">Usar sigla</SelectItem>
                <SelectItem value="descricao">Usar descrição</SelectItem>
                <SelectItem value="personalizada">Forma personalizada</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={adicionarSigla} disabled={salvando}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
          {siglas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma sigla cadastrada.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {siglas.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{s.sigla}</span>
                    <span className="text-muted-foreground"> — {s.descricao_oficial}</span>
                    {s.forma_documental && (
                      <span className="text-xs text-muted-foreground"> · doc.: {s.forma_documental}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{s.modo ?? "sigla"}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => removerSigla(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-fundamentos">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Fundamentos legais configuráveis</CardTitle>
          </div>
          <CardDescription>
            Usados apenas nos assuntos cujo modelo oficial exige fundamento. Nenhum
            fundamento é aplicado sem cadastro; com um único fundamento marcado como
            padrão, ele é sugerido automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <Select value={novoFund.codigo_assunto}
              onValueChange={(v) => setNovoFund({ ...novoFund, codigo_assunto: v })}>
              <SelectTrigger><SelectValue placeholder="Assunto" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.codigo}>{t.titulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Título interno" value={novoFund.titulo}
              onChange={(e) => setNovoFund({ ...novoFund, titulo: e.target.value })} />
            <Input placeholder="Texto oficial do fundamento" value={novoFund.texto_oficial}
              onChange={(e) => setNovoFund({ ...novoFund, texto_oficial: e.target.value })} />
            <Button size="sm" onClick={adicionarFundamento} disabled={salvando}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
          {fundamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum fundamento cadastrado.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {fundamentos.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{f.titulo}</span>
                      <Badge variant="outline" className="text-[10px]">{f.codigo_assunto}</Badge>
                      {f.padrao && <Badge className="text-[10px]">padrão</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{f.texto_oficial}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => alternarPadrao(f)}>
                      {f.padrao ? "Remover padrão" : "Tornar padrão"}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removerFundamento(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-homologacao">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Modelos em homologação</CardTitle>
          </div>
          <CardDescription>
            Subtipos criados no Bloco 10E permanecem indisponíveis para geração oficial
            até que um exemplar real do documento seja fornecido e homologado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emHomologacao.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todos os modelos cadastrados estão homologados.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {emHomologacao.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{t.titulo}</span>
                    {t.subtipo && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{t.subtipo}</Badge>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">v{t.versao ?? 1}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {rotuloEstado(t.estado_homologacao)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
