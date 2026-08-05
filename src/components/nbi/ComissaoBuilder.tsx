// Bloco 9B — Nomeação de comissão: formulário integralmente estruturado.
// O operador não redige nenhuma parte da frase oficial: o sistema monta
// COMPOSICAO e FINALIDADE a partir do cadastro e de opções controladas.
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Crown } from "lucide-react";
import type { MilitarNbi } from "@/utils/nbi";
import { montarPostoQuadro } from "@/utils/nbi";
import { lotacaoDocumentalDe, funcaoDocumentalDe } from "@/lib/nbi/formatacao";
import {
  type IntegranteComissao, trechoIntegrante, comporComposicao,
  comporFinalidade, FINALIDADES_COMISSAO,
} from "@/lib/nbi/derivados";
import {
  FUNCOES_COMISSAO, funcaoEfetiva, rotuloFuncao, validarFuncoesComissao,
  exigeVarianteEspecial, type FuncaoComissao, type IntegranteFuncao,
} from "@/lib/nbi/comissao";

function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ComissaoBuilder({
  campos, militares, onCampo,
}: {
  campos: Record<string, string | boolean>;
  militares: MilitarNbi[];
  onCampo: (chave: string, v: string | boolean) => void;
}) {
  const integrantes = useMemo<IntegranteComissao[]>(() => {
    try {
      const raw = String(campos.integrantes_json ?? "");
      const arr = raw ? (JSON.parse(raw) as IntegranteComissao[]) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }, [campos.integrantes_json]);

  const finalidadeId = String(campos.finalidade_id ?? "");
  const objeto = String(campos.finalidade_objeto ?? "");
  const unidade = String(campos.finalidade_unidade ?? "");

  function dadosMilitar(id: string | null | undefined) {
    const m = militares.find((x) => x.id === id);
    if (!m) return null;
    return {
      posto_quadro: montarPostoQuadro(m.posto_graduacao, m.quadro),
      nome: m.nome,
      matricula: m.matricula ?? "",
    };
  }

  function persistir(lista: IntegranteComissao[]) {
    onCampo("integrantes_json", JSON.stringify(lista));
    const trechos = lista.map((i) => trechoIntegrante(i, i.tipo === "militar" ? dadosMilitar(i.militar_id) : null));
    onCampo("COMPOSICAO", comporComposicao(trechos));
  }

  function atualizarFinalidade(patch: { id?: string; objeto?: string; unidade?: string }) {
    const id = patch.id ?? finalidadeId;
    const obj = patch.objeto ?? objeto;
    const uni = patch.unidade ?? unidade;
    if (patch.id !== undefined) onCampo("finalidade_id", id);
    if (patch.objeto !== undefined) onCampo("finalidade_objeto", obj);
    if (patch.unidade !== undefined) onCampo("finalidade_unidade", uni);
    onCampo("FINALIDADE", comporFinalidade(id, obj, uni));
  }

  function adicionar(tipo: "militar" | "externo") {
    const funcao: FuncaoComissao = integrantes.length === 0 ? "presidente" : "membro";
    persistir([...integrantes, { id: uid(), tipo, tratamento: "Sr.", documento_tipo: "CPF", funcao }]);
  }
  function atualizar(id: string, patch: Partial<IntegranteComissao>) {
    persistir(integrantes.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function remover(id: string) {
    persistir(integrantes.filter((i) => i.id !== id));
  }
  function tornarPresidente(id: string) {
    const alvo = integrantes.find((i) => i.id === id);
    if (!alvo) return;
    persistir([
      { ...alvo, funcao: "presidente" },
      ...integrantes
        .filter((i) => i.id !== id)
        .map((i) => (i.funcao === "presidente" ? { ...i, funcao: "membro" as FuncaoComissao } : i)),
    ]);
  }

  const problemasFuncoes = validarFuncoesComissao(
    integrantes as unknown as IntegranteFuncao[],
    { confirmarDoisPresidentes: campos.confirmar_dois_presidentes === true },
  );
  const varianteEspecial = exigeVarianteEspecial(integrantes as unknown as IntegranteFuncao[]);

  const previewComposicao = comporComposicao(
    integrantes.map((i) => trechoIntegrante(i, i.tipo === "militar" ? dadosMilitar(i.militar_id) : null)),
  );

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="rounded-md border p-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Finalidade da comissão</Label>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <Select value={finalidadeId} onValueChange={(v) => atualizarFinalidade({ id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecionar finalidade" /></SelectTrigger>
            <SelectContent>
              {FINALIDADES_COMISSAO.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={objeto}
            onChange={(e) => atualizarFinalidade({ objeto: e.target.value })}
            placeholder="Objeto / material avaliado"
          />
          <Input
            value={unidade}
            onChange={(e) => atualizarFinalidade({ unidade: e.target.value })}
            placeholder="Unidade relacionada (opcional)"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Frase montada pelo sistema: <em>{comporFinalidade(finalidadeId, objeto, unidade) || "—"}</em>
        </p>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Integrantes</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => adicionar("militar")}>
              <Plus className="mr-1 h-3 w-3" /> Militar cadastrado
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => adicionar("externo")}>
              <Plus className="mr-1 h-3 w-3" /> Pessoa externa
            </Button>
          </div>
        </div>

        {integrantes.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nenhum integrante. O primeiro integrante adicionado é o presidente da comissão.
          </p>
        )}

        <div className="mt-3 space-y-2">
          {integrantes.map((i, idx) => {
            const dados = i.tipo === "militar" ? dadosMilitar(i.militar_id) : null;
            const mil = militares.find((m) => m.id === i.militar_id) ?? null;
            return (
              <div key={i.id} className="rounded border p-2">
                <div className="mb-2 flex items-center gap-2">
                  {funcaoEfetiva(i as unknown as IntegranteFuncao, idx) === "presidente"
                    ? <Badge className="text-[10px]"><Crown className="mr-1 h-3 w-3" /> Presidente</Badge>
                    : (
                      <Badge variant="secondary" className="text-[10px]">
                        {rotuloFuncao(funcaoEfetiva(i as unknown as IntegranteFuncao, idx), i.funcao_outra)}
                      </Badge>
                    )}
                  <span className="text-xs text-muted-foreground">
                    {i.tipo === "militar" ? "Militar cadastrado" : "Pessoa externa"}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <Select
                      value={funcaoEfetiva(i as unknown as IntegranteFuncao, idx)}
                      onValueChange={(v) => atualizar(i.id, { funcao: v as FuncaoComissao })}
                    >
                      <SelectTrigger className="h-7 w-[190px] text-xs" data-testid={`comissao-funcao-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FUNCOES_COMISSAO.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {funcaoEfetiva(i as unknown as IntegranteFuncao, idx) === "outra" && (
                      <Input
                        className="h-7 w-[180px] text-xs"
                        value={i.funcao_outra ?? ""}
                        onChange={(e) => atualizar(i.id, { funcao_outra: e.target.value })}
                        placeholder="Função confirmada"
                      />
                    )}
                    {funcaoEfetiva(i as unknown as IntegranteFuncao, idx) !== "presidente" && (
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => tornarPresidente(i.id)}>
                        Tornar presidente
                      </Button>
                    )}
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => remover(i.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {i.tipo === "militar" ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Select value={i.militar_id ?? ""} onValueChange={(v) => atualizar(i.id, { militar_id: v || null })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar militar" /></SelectTrigger>
                      <SelectContent>
                        {militares.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.posto_graduacao ?? ""} {m.nome} {m.matricula ? `· ${m.matricula}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={i.funcao ?? ""}
                      onChange={(e) => atualizar(i.id, { funcao: e.target.value })}
                      placeholder="Função na comissão (opcional)"
                    />
                    {mil && (
                      <p className="md:col-span-2 text-[11px] text-muted-foreground">
                        Banco de Militares: {dados?.posto_quadro || "posto/quadro ausente"} ·
                        {" "}ID FUNC {dados?.matricula || "ausente"} ·
                        {" "}{lotacaoDocumentalDe(mil) || "lotação ausente"} ·
                        {" "}{funcaoDocumentalDe(mil) || "função documental ausente"}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-4">
                    <Select value={i.tratamento ?? "Sr."} onValueChange={(v) => atualizar(i.id, { tratamento: v as "Sr." | "Sra." })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sr.">Sr.</SelectItem>
                        <SelectItem value="Sra.">Sra.</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={i.nome ?? ""}
                      onChange={(e) => atualizar(i.id, { nome: e.target.value })}
                      placeholder="Nome completo"
                    />
                    <Select value={i.documento_tipo ?? "CPF"} onValueChange={(v) => atualizar(i.id, { documento_tipo: v as "CPF" | "RG" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CPF">CPF</SelectItem>
                        <SelectItem value="RG">RG</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={i.documento ?? ""}
                      onChange={(e) => atualizar(i.id, { documento: e.target.value })}
                      placeholder="Número do documento"
                    />
                    <Input
                      className="md:col-span-4"
                      value={i.funcao ?? ""}
                      onChange={(e) => atualizar(i.id, { funcao: e.target.value })}
                      placeholder="Função na comissão (opcional)"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {problemasFuncoes.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-[11px] text-destructive" data-testid="comissao-problemas">
            {problemasFuncoes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        )}
        {problemasFuncoes.some((p) => p.includes("Presidentes")) && (
          <label className="mt-2 flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={campos.confirmar_dois_presidentes === true}
              onChange={(e) => onCampo("confirmar_dois_presidentes", e.target.checked)}
            />
            Confirmo administrativamente mais de um Presidente nesta comissão.
          </label>
        )}
        {varianteEspecial && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400" data-testid="comissao-variante-especial">
            Comissão com Secretário/Relator usa variante própria — em homologação, sem exemplar oficial.
            Geração de NBI oficial bloqueada para esta composição.
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Composição montada pelo sistema: <em>{previewComposicao || "—"}</em>
        </p>
      </div>
    </div>
  );
}
