// Wrapper de Input / Textarea com sugestão ortográfica não intrusiva.
// Usar EXCLUSIVAMENTE em campos livres digitados pelo operador.
// Nunca aplicar em campos derivados do banco, placeholders ou textos oficiais.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useSpellchecker } from "@/hooks/use-spellcheck";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  sugestoesTexto,
  aplicarSugestao,
  sugestaoInicialMaiuscula,
  type SugestaoPalavra,
} from "@/utils/nbi-corretor";
import { sugerirToponimo, type SugestaoToponimo } from "@/utils/nbi-toponimos";

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  extraWords?: Set<string>;
  disabled?: boolean;
  // 'nome_proprio' → sugere capitalização palavra a palavra (ORIGEM/DESTINO/cidade).
  // 'inicial'      → sugere inicial maiúscula (MISSAO/MOTIVO).
  capitalizacao?: "nome_proprio" | "inicial";
  // Quando true, analisa a EXPRESSÃO completa contra a lista curada de
  // municípios (RS). Sugere grafia oficial ou avisa que não reconheceu.
  modoToponimo?: boolean;
}

export function CampoLivreCorrigido({
  id, value, onChange, placeholder, multiline, rows, extraWords, disabled, capitalizacao, modoToponimo,
}: Props) {
  const [focused, setFocused] = useState(false);
  const { spell, loading } = useSpellchecker(focused);
  const [sugestoes, setSugestoes] = useState<SugestaoPalavra[]>([]);
  const [sugInicial, setSugInicial] = useState<{ correcao: string } | null>(null);
  const [sugTop, setSugTop] = useState<SugestaoToponimo | null>(null);
  const [ignoradas, setIgnoradas] = useState<Set<string>>(new Set());
  const [topIgnorado, setTopIgnorado] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extras = useMemo(() => extraWords ?? new Set<string>(), [extraWords]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (modoToponimo) {
        // Modo topônimo: analisa a expressão inteira. Silencia o analisador
        // palavra-a-palavra para não duplicar sugestões conflitantes.
        const s = sugerirToponimo(value);
        setSugTop(s && s.correcao !== topIgnorado ? s : null);
        setSugestoes([]);
        setSugInicial(null);
      } else {
        const s = sugestoesTexto(value, spell, {
          extras,
          ignoradas,
          capitalizarProprios: capitalizacao === "nome_proprio",
        });
        setSugestoes(s);
        setSugInicial(capitalizacao === "inicial" ? sugestaoInicialMaiuscula(value) : null);
        setSugTop(null);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, spell, extras, ignoradas, capitalizacao, modoToponimo, topIgnorado]);

  function aplicar(s: SugestaoPalavra) {
    const novo = aplicarSugestao(value, s);
    onChange(novo);
    setSugestoes((prev) => prev.filter((x) => x.inicio !== s.inicio));
  }

  function ignorar(s: SugestaoPalavra) {
    setIgnoradas((prev) => {
      const next = new Set(prev);
      next.add(s.original.toLowerCase());
      return next;
    });
    setSugestoes((prev) => prev.filter((x) => x.original.toLowerCase() !== s.original.toLowerCase()));
  }

  function aplicarInicial() {
    if (!sugInicial) return;
    onChange(sugInicial.correcao);
    setSugInicial(null);
  }

  function aplicarTop() {
    if (!sugTop) return;
    onChange(sugTop.correcao);
    setSugTop(null);
  }

  function ignorarTop() {
    if (!sugTop) return;
    setTopIgnorado(sugTop.correcao);
    setSugTop(null);
  }


  const comum = {
    id,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    placeholder,
    disabled,
    spellCheck: false as const,
    autoComplete: "off" as const,
  };

  return (
    <div className="space-y-1">
      {multiline
        ? <Textarea {...comum} rows={rows ?? 2} />
        : <Input {...comum} />}

      {sugestoes.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Possíveis correções ortográficas:</p>
          {sugestoes.map((s, i) => (
            <div key={`${s.inicio}-${i}`} className="flex items-center gap-2">
              <span className="flex-1">
                "<strong>{s.original}</strong>" → "<strong>{s.correcao}</strong>"
              </span>
              <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => aplicar(s)}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Aplicar
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => ignorar(s)}>
                <X className="mr-1 h-3 w-3" /> Ignorar
              </Button>
            </div>
          ))}
        </div>
      )}

      {sugInicial && (
        <div className="flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="flex-1">Sugestão: iniciar o texto com letra maiúscula.</span>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={aplicarInicial}>
            <CheckCircle2 className="mr-1 h-3 w-3" /> Aplicar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => setSugInicial(null)}>
            <X className="mr-1 h-3 w-3" /> Ignorar
          </Button>
        </div>
      )}

      {focused && loading && !spell && (
        <p className="text-[10px] text-muted-foreground">Carregando dicionário ortográfico…</p>
      )}
    </div>
  );
}
