// Combobox pesquisável de assuntos, agrupado por categoria visual.
// Fonte única: lista de templates carregada de public.nbi_templates.
// Templates com disponivel=false aparecem desabilitados com aviso.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, Lock } from "lucide-react";
import {
  CATEGORIAS_ORDEM, categoriaDoCodigo, ordemDoCodigo, CODIGOS_HOMOLOGADOS, ehVarianteInterna,
  type CategoriaNbi,
} from "@/utils/nbi-categorias";
import { obterMotor } from "@/lib/nbi/motores/registry";
import { podeGerarOficial, normalizarEstado } from "@/lib/nbi/homologacao";


export interface TemplatePickable {
  codigo: string;
  titulo: string;
  titulo_documento: string | null;
  disponivel: boolean;
  /** Bloco 10E — homologado | em_homologacao | aguardando_exemplar | bloqueado. */
  estado_homologacao?: string | null;
}

interface Props {
  templates: TemplatePickable[];
  onEscolher: (codigo: string) => void;
  label?: string;
  size?: "sm" | "default";
  /** Identificador estável para automação (data-testid do gatilho). */
  testId?: string;
}

/**
 * Regra central única de habilitação. Um assunto só é bloqueado quando não é
 * homologado, o template não está disponível ou não existe motor registrado.
 * Busca, categoria, acentuação e badge nunca influenciam este resultado.
 */
export function assuntoSelecionavel(t: TemplatePickable): boolean {
  return (
    t.disponivel
    && podeGerarOficial(t.estado_homologacao ?? "homologado")
    && CODIGOS_HOMOLOGADOS.has(t.codigo)
    && obterMotor(t.codigo) !== null
  );
}

/** data-testid estável, derivado somente do código interno do motor. */
export function testIdDoAssunto(codigo: string): string {
  return `nbi-assunto-option-${codigo}`;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}


export function AssuntoPicker({ templates, onEscolher, label, size = "default", testId }: Props) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const porCategoria = useMemo(() => {
    const map: Record<CategoriaNbi, TemplatePickable[]> = {
      "AFASTAMENTOS": [], "MOVIMENTAÇÕES": [], "SERVIÇO": [], "ADMINISTRATIVO": [],
    };
    const filtrados = templates.filter((t) => {
      // Variantes internas guardam apenas a redação de um subtipo.
      if (ehVarianteInterna(t.codigo)) return false;
      if (!busca.trim()) return true;
      const b = normalizar(busca);
      const cat = normalizar(categoriaDoCodigo(t.codigo));
      return (
        normalizar(t.titulo).includes(b) ||
        normalizar(t.titulo_documento ?? "").includes(b) ||
        normalizar(t.codigo).includes(b) ||
        cat.includes(b)
      );
    });
    for (const t of filtrados) {
      map[categoriaDoCodigo(t.codigo)].push(t);
    }
    // RF-04 — sequência administrativa dentro de cada categoria.
    for (const cat of CATEGORIAS_ORDEM) {
      map[cat].sort((a, b) => {
        const d = ordemDoCodigo(a.codigo) - ordemDoCodigo(b.codigo);
        return d !== 0 ? d : a.titulo.localeCompare(b.titulo, "pt-BR");
      });
    }
    return map;

  }, [templates, busca]);

  const nenhum = CATEGORIAS_ORDEM.every((c) => porCategoria[c].length === 0);

  function escolher(codigo: string, homologado: boolean) {
    if (!homologado) return;
    onEscolher(codigo);
    setBusca("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} data-testid={testId ?? "adicionar-assunto"}>
          <Plus className="mr-2 h-4 w-4" />
          {label ?? "Adicionar assunto"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start" data-testid="assunto-picker-lista">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Pesquisar assunto…"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList className="max-h-[360px]">
            {nenhum && <CommandEmpty>Nenhum assunto encontrado.</CommandEmpty>}
            {CATEGORIAS_ORDEM.map((cat) => {
              const itens = porCategoria[cat];
              if (itens.length === 0) return null;
              return (
                <CommandGroup key={cat} heading={cat}>
                  {itens.map((t) => {
                    const homologado = assuntoSelecionavel(t);
                    const status: "disponivel" | "nao_configurado" | "proxima_etapa" =
                      homologado ? "disponivel"
                        : (t.disponivel ? "proxima_etapa" : "nao_configurado");
                    return (
                      <CommandItem
                        key={t.codigo}
                        value={t.codigo}
                        onSelect={() => escolher(t.codigo, homologado)}
                        disabled={!homologado}
                        data-testid={testIdDoAssunto(t.codigo)}
                        data-codigo={t.codigo}
                        data-disponivel={homologado ? "true" : "false"}
                        aria-disabled={homologado ? "false" : "true"}
                        className={homologado ? "" : "opacity-60"}
                      >

                        <div className="flex w-full items-center gap-2">
                          {homologado
                            ? <Check className="h-4 w-4 text-emerald-600" />
                            : <Lock className="h-4 w-4 text-muted-foreground" />}
                          <div className="flex-1">
                            <div className="text-sm font-medium">{t.titulo}</div>
                            {status === "nao_configurado" && (
                              <div className="text-[10px] text-muted-foreground">
                                {normalizarEstado(t.estado_homologacao) === "em_homologacao"
                                  ? "Em homologação — não disponível para geração oficial."
                                  : normalizarEstado(t.estado_homologacao) === "aguardando_exemplar"
                                    ? "Aguardando exemplar oficial — geração bloqueada."
                                    : "Modelo ainda não configurado para geração"}
                              </div>
                            )}
                            {status === "proxima_etapa" && (
                              <div className="text-[10px] text-muted-foreground">
                                Disponível em próxima etapa
                              </div>
                            )}
                          </div>
                          {status === "disponivel" && (
                            <Badge variant="secondary" className="text-[10px]">disponível</Badge>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
