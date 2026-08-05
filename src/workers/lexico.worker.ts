// Worker do léxico PT — tira o parsing de 4,4 MB da thread principal.
// Protocolo mínimo: a página pede "carregar"; o worker responde "pronto"
// com o índice serializado como pares [chave, forma_oficial].

import { indexarLexico } from "@/utils/nbi-lexico";

self.onmessage = async (ev: MessageEvent<{ tipo: "carregar"; url: string }>) => {
  if (ev.data?.tipo !== "carregar") return;
  try {
    const res = await fetch(ev.data.url);
    if (!res.ok) throw new Error("falha ao baixar léxico");
    const texto = await res.text();
    const idx = indexarLexico(texto);
    (self as unknown as Worker).postMessage({ tipo: "pronto", pares: Array.from(idx.entries()) });
  } catch (e) {
    (self as unknown as Worker).postMessage({ tipo: "erro", mensagem: (e as Error).message });
  }
};
