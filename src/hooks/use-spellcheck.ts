// Corretor ortográfico offline (nspell + dictionary-pt) carregado sob demanda.
// Dicionário fica em cache de módulo — só faz o download uma vez por sessão.
// Nunca substitui automaticamente: apenas expõe {correct, suggest}.

import { useEffect, useRef, useState } from "react";

export interface Spellchecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

let cache: Spellchecker | null = null;
let carregando: Promise<Spellchecker> | null = null;

async function carregarSpellchecker(): Promise<Spellchecker> {
  if (cache) return cache;
  if (carregando) return carregando;

  carregando = (async () => {
    // Dinâmico: só entra no bundle quando o operador realmente digita em campo livre.
    const [{ default: nspell }, affMod, dicMod] = await Promise.all([
      import("nspell"),
      import("dictionary-pt/index.aff?url"),
      import("dictionary-pt/index.dic?url"),
    ]);
    const [affRes, dicRes] = await Promise.all([
      fetch((affMod as { default: string }).default),
      fetch((dicMod as { default: string }).default),
    ]);
    const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
    const spell = nspell({ aff, dic });
    cache = spell as Spellchecker;
    return cache;
  })();

  return carregando;
}

export function useSpellchecker(enabled: boolean = true): {
  spell: Spellchecker | null;
  loading: boolean;
} {
  const [spell, setSpell] = useState<Spellchecker | null>(cache);
  const [loading, setLoading] = useState(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || spell) return;
    setLoading(true);
    carregarSpellchecker()
      .then((s) => {
        if (montado.current) setSpell(s);
      })
      .catch(() => {
        // Silencioso: se o dicionário falhar, o corretor apenas fica indisponível.
      })
      .finally(() => {
        if (montado.current) setLoading(false);
      });
  }, [enabled, spell]);

  return { spell, loading };
}
