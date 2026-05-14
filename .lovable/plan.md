## Diagnóstico

A lógica de teto e complemento de carga **já existe** dentro de `escalar()` em `src/utils/escala.functions.ts` (etapa 6.5):

- Linhas 1404–1426: corta EXP do ADM quando `totalExp > alvoAdm` (cap mensal).
- Linhas 1486–1502: lança `CM` em dias úteis livres quando o operacional fecha o mês abaixo de `cargaMin`.

O problema é que o `for (const m of militares)` que executa essas duas rotinas tem, logo no começo, um curto-circuito para o modo ordinário puro (linhas 1375–1387):

```ts
if (par.modo === "ordinario_puro") {
  if (m.isAdm) continue;          // pula o cap do ADM
  …
  if (cargaOrdPure < cargaMinPure) {
    acertosCm.push(`… faltam Xh — modo ordinário puro: sem complemento`);
  }
  continue;                       // pula o lançamento de CM
}
```

Com isso, em modo puro:
- ADM ignora o cap e fica com 186 h (etapa 6.2 lançou EXP9/EXP6 sem limite).
- Operacionais ficam 1 h abaixo do alvo (176 h em vez de 177 h) porque o `CM` faltante não é lançado.

Em modo `auto` o cap do ADM funciona porque o `continue` não dispara, mas a lógica está duplicada e frágil — qualquer modo novo pode regressar.

## Correção

Arquivo único: `src/utils/escala.functions.ts`. Sem mudar fórmulas (`cargaBase`, `cargaMensalProporcional`) — apenas **deixar a lógica que já existe rodar em qualquer modo**.

1. **Remover o bloco `if (par.modo === "ordinario_puro")` (linhas 1375–1387)** do início do `for (const m of militares)` em `escalar()`. O fluxo passa a ser único:
   - ADM → cap atual (linhas 1392–1460), sem ramificação por modo.
   - Operacional → complemento `CM` atual (linhas 1462–1507), sem ramificação por modo.

2. **Não mexer** em:
   - `cargaBase`, `cargaMensalProporcional`, `horasOrdSigla`, `ORD_HORAS`.
   - Etapa 6.2 (lançamento EXP9/EXP6 ADM).
   - Etapa 6.5.1 (sanitização ADM em fds/feriado).
   - Etapa 6.6 (HE só após fechar carga ADM).

3. **Manter** os alertas existentes (`Expediente complementar (ADM): … teto mensal`, `Complemento de carga (CM) lançado: …`) — eles passam a aparecer também em modo puro, dando rastro de auditoria.

Efeito prático: em todo modo, o motor vai (a) cortar EXP do ADM quando o lançamento padrão estourar o teto e (b) preencher operacionais com `CM` até bater a carga mensal proporcional — exatamente o que a fórmula já manda.

## Validação

- Build do projeto.
- Re-gerar dezembro/2025 nos dois modos:
  - TENENTE 1 / TENENTE 2 → 177 h (cap remove 9 h do dia 31).
  - Operacionais 24×72 com 7 plantões → 177 h (CM9 distribuído em dia útil livre).
  - Alertas `Expediente complementar (ADM): … teto mensal` e `Complemento de carga (CM) lançado: …` presentes.
