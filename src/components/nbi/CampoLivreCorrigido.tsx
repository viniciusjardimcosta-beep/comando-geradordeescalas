// Wrapper de Input / Textarea com sugestão ortográfica não intrusiva.
// Usar EXCLUSIVAMENTE em campos livres digitados pelo operador.
// Nunca aplicar em campos derivados do banco, placeholders ou textos oficiais.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useSpellchecker } from "@/hooks/use-spellcheck";
import { CheckCircle2, X } from "lucide-react";

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  extraWords?: Set<string>;
  disabled?: boolean;
}

// Tokeniza preservando pontuação para reconstrução exata.
function palavras(s: string): string[] {
  return s.match(/[\p{L}\p{M}\d'\-]+/gu) ?? [];
}

// Palavras que o corretor ignora por convenção (siglas em CAIXA ALTA, números,
// abreviações com ponto). Isso complementa o dicionário militar / dinâmico.
function deveIgnorar(word: string): boolean {
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  if (/[A-ZÁÉÍÓÚÇÃÕÂÊÔ]{2,}/.test(word) && word === word.toUpperCase()) return true;
  if (/\d/.test(word)) return true;
  return false;
}

export function CampoLivreCorrigido({
  id, value, onChange, placeholder, multiline, rows, extraWords, disabled,
}: Props) {
  const [focused, setFocused] = useState(false);
  const { spell, loading } = useSpellchecker(focused);
  const [sugestao, setSugestao] = useState<{ original: string; correcao: string } | null>(null);
  const [ignoradas, setIgnoradas] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extras = useMemo(() => extraWords ?? new Set<string>(), [extraWords]);

  useEffect(() => {
    if (!spell || !focused) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const toks = palavras(value);
      for (let i = toks.length - 1; i >= 0; i--) {
        const w = toks[i];
        if (deveIgnorar(w)) continue;
        if (ignoradas.has(w.toLowerCase())) continue;
        if (extras.has(w) || extras.has(w.toLowerCase())) continue;
        if (spell.correct(w)) continue;
        const sugs = spell.suggest(w);
        if (sugs.length === 0) continue;
        const alvo = sugs[0];
        if (alvo.toLowerCase() === w.toLowerCase()) continue;
        setSugestao({ original: w, correcao: alvo });
        return;
      }
      setSugestao(null);
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, spell, focused, extras, ignoradas]);

  function aplicar() {
    if (!sugestao) return;
    // Substituição da última ocorrência da palavra original (case-insensitive),
    // preservando o restante do texto do operador.
    const re = new RegExp(`\\b${sugestao.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!.*\\b${sugestao.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b)`, "i");
    const novo = value.replace(re, sugestao.correcao);
    onChange(novo);
    setSugestao(null);
  }

  function ignorar() {
    if (!sugestao) return;
    setIgnoradas((prev) => {
      const next = new Set(prev);
      next.add(sugestao.original.toLowerCase());
      return next;
    });
    setSugestao(null);
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
      {sugestao && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="flex-1">
            Você quis dizer: <strong>{sugestao.correcao}</strong>?
            <span className="ml-1 text-amber-700 dark:text-amber-400">
              (no lugar de "{sugestao.original}")
            </span>
          </span>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={aplicar}>
            <CheckCircle2 className="mr-1 h-3 w-3" /> Aplicar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={ignorar}>
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
