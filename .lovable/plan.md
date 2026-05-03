## Problema

A aba **Anexo B - Escala** fica em vermelho após a geração e cada célula preenchida pelo sistema mostra o aviso *"Inválido: a entrada precisa estar dentro de um intervalo especificado"*.

## Causa

As células do Anexo B têm validação de dados (lista suspensa) com itens cadastrados como **número** (ex.: `234`, `1`). Hoje o gerador escreve **toda célula como texto** (`inlineStr`), então o `"234"` (string) não bate com o `234` (número) da lista → Excel marca como inválido.

Siglas alfabéticas (`FER`, `HE8`, `CM2`, `1+CM2`...) não disparam o aviso porque a lista as tem como texto.

## Correção

Alterar **apenas** a função `buildCell` em `src/utils/xlsx-surgical.ts`: detectar valores estritamente numéricos e gravá-los como célula numérica nativa (`t="n"`), mantendo `inlineStr` para o resto.

```ts
function buildCell(ref, value, styleAttr) {
  if (value === "" || value == null) return `<c r="${ref}"${styleAttr}/>`;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `<c r="${ref}"${styleAttr} t="n"><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${encodeXmlText(value)}</t></is></c>`;
}
```

## Impacto

- Siglas numéricas (`234`, `1`) passam a casar com a lista de validação → aba deixa de ficar vermelha.
- Texto, fórmulas, estilos, lógica de geração: nada mais muda.

## Arquivo alterado

- `src/utils/xlsx-surgical.ts` — somente `buildCell`.
