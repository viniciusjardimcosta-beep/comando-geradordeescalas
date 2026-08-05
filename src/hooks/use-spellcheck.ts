// Corretor ortográfico offline do módulo NBI.
//
// IMPORTANTE (Bloco 10C): a implementação anterior construía um Hunspell
// (nspell) com o dicionário PT completo — 312.368 verbetes — na thread
// principal. A construção custa MINUTOS de CPU e travava a Etapa 3 —
// Conferência, o que aparecia como "re-render contínuo".
//
// Agora o dicionário é apenas indexado (Map de forma achatada → forma
// oficial) dentro de um Web Worker. A interface pública {correct, suggest}
// foi preservada, então nenhum consumidor precisou mudar.

import { useEffect, useRef, useState } from "react";
import {
  conhecida,
  indexarLexico,
  sugerirPorLexico,
  type IndiceLexico,
} from "@/utils/nbi-lexico";

export interface Spellchecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

const URL_DIC = "/dicionarios/pt/pt.dic";

let cache: Spellchecker | null = null;
let carregando: Promise<Spellchecker> | null = null;

function comoSpellchecker(idx: IndiceLexico): Spellchecker {
  return {
    correct: (w) => conhecida(w, idx),
    suggest: (w) => {
      const s = sugerirPorLexico(w, idx);
      return s ? [s] : [];
    },
  };
}

function carregarViaWorker(): Promise<IndiceLexico> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/lexico.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      reject(e as Error);
      return;
    }
    const encerrar = () => worker.terminate();
    worker.onmessage = (ev: MessageEvent<{ tipo: string; pares?: [string, string][]; mensagem?: string }>) => {
      if (ev.data?.tipo === "pronto" && ev.data.pares) {
        encerrar();
        resolve(new Map(ev.data.pares));
      } else {
        encerrar();
        reject(new Error(ev.data?.mensagem ?? "worker do léxico falhou"));
      }
    };
    worker.onerror = (e) => {
      encerrar();
      reject(new Error(e.message || "worker do léxico indisponível"));
    };
    worker.postMessage({ tipo: "carregar", url: URL_DIC });
  });
}

async function carregarNaThreadPrincipal(): Promise<IndiceLexico> {
  const res = await fetch(URL_DIC);
  if (!res.ok) throw new Error("falha ao baixar léxico PT");
  return indexarLexico(await res.text());
}

async function carregarSpellchecker(): Promise<Spellchecker> {
  if (cache) return cache;
  if (carregando) return carregando;

  carregando = (async () => {
    if (typeof window === "undefined") {
      throw new Error("spellchecker indisponível no servidor");
    }
    let idx: IndiceLexico;
    try {
      idx = await carregarViaWorker();
    } catch {
      // Fallback: parsing na página. Continua muito mais barato que o nspell,
      // mas só é usado quando Web Worker não está disponível.
      idx = await carregarNaThreadPrincipal();
    }
    cache = comoSpellchecker(idx);
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
        // Silencioso: sem dicionário, a revisão fica apenas com o mapa curado.
      })
      .finally(() => {
        if (montado.current) setLoading(false);
      });
  }, [enabled, spell]);

  return { spell, loading };
}
