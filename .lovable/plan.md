## Problema

A função `cargaMensalProporcional` em `src/utils/escala.functions.ts` (linha 602) está arredondando o teto mensal para o múltiplo de 6 mais próximo:

```ts
return Math.round(bruto / 6) * 6;
```

Isso inflaciona o teto (ex.: 177h vira 180h, 119h vira 120h) e quebra a classificação ORD vs HE descrita na regra do usuário, gerando os erros vermelhos de carga horária na escala atual.

## Correção

Alterar a função para retornar o piso da carga proporcional, sem arredondar para múltiplos de 6:

```ts
const cargaMensalProporcional = (af: number): number => {
  const bruto = cargaBase(dias) * (1 - af / dias);
  return Math.floor(bruto);
};
```

Isso é suficiente porque a lógica de `lancaServico24` (linhas 836–910) já implementa exatamente a regra solicitada:

1. Calcula `espacoOrd = tetoOrd - usadoOrd`.
2. Se `espacoOrd >= 18`, lança turno cheio `234` (ORD).
3. Se `0 < espacoOrd < 6`, lança o saldo como **CM** no dia e completa o resto da jornada física como **HE** — fechando exatamente a carga ordinária antes de qualquer HE.
4. Se `espacoOrd <= 0`, tudo vira **HE**, respeitando o teto mensal de HE.

A 4ª etapa (linhas 1260–1316) também usa `cargaMensalProporcional` para fechar CM administrativo e ajustar `cargaMin`. Com `Math.floor`, o alvo volta ao valor real da planilha (177h, 119h etc.), eliminando o CM/HE indevido que aparecia quando o alvo era 180h.

## Arquivos alterados

- `src/utils/escala.functions.ts` — apenas as linhas 596–605 (comentário + corpo de `cargaMensalProporcional`).

## Resultado esperado

- Sd Augusto (carga 120h, 5 plantões = 120h): teto = 120, ORD = 120 exatos, sem CM, qualquer extra vira HE.
- Militares com carga 177h: teto = 177 (não 180), eliminando o erro vermelho de "carga acima do limite".
- Demais militares mantêm a lógica de fechar ORD com turnos + CM residual antes de iniciar HE.
