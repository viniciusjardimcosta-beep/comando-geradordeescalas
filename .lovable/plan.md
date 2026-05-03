## Problemas observados

1. **Aba AK em vermelho** (carga total não bate com a carga mensal).
2. **Lançamentos passando de 24h no mesmo dia** (ex.: `234` + `CM1` + `HE5` no dia D **mais** `1` no dia D+1 = 30h de plantão).

## Causa raiz (etapa 5 — "Acerto de carga horária mensal")

O bloco `lancaServico24` já lança o plantão 24x72 corretamente em **dois dias**: `234` (18h) no dia D + `1` (6h) na madrugada do dia D+1 = 24h físicas.

Depois disso, a **etapa 5** (linhas 1265-1292 de `src/utils/escala.functions.ts`) faz duas coisas erradas para compensar carga horária mensal faltante:

1. **Adiciona `CM<x>` no MESMO dia do plantão**, assumindo que sobram 6h físicas no dia D ("18h ORD + 6h CM = 24h"). Mas as 6h restantes do plantão já estão lançadas como `1` no dia D+1 — somando, o militar trabalha 18 (D) + CM (D) + 6 (D+1) = mais de 24h corridas.
2. **Lança `HE<resto>` no mesmo dia D** "para fechar 24h físicas". Esse HE é totalmente fictício: o militar não tem janela física para essas horas, e o resultado é a célula HE em vermelho mais a carga mensal estourando o teto (AK).

Resultado visível na planilha:
- Dia D: `234` + `CM1` + `HE5` (= "24h" nominal no dia)
- Dia D+1: `1` (= 6h da madrugada do plantão, intacto)
- Total real do plantão: **30h** em vez de 24h
- Coluna AK: soma final ultrapassa a carga mensal alvo → célula fica vermelha.

## Correção

Em `src/utils/escala.functions.ts`, dentro do laço `for (const m of militares)` da etapa 5, no caminho `cargaOrd < cargaMin`:

- **Remover** todo o bloco que tenta acrescentar `CM` no dia do último `234` e em seguida fechar com `HE` (linhas ~1265 a 1292, do comentário "1) Se há serviço 24h restante…" até o `}` que precede o comentário "2) Resto…").
- **Manter apenas** o laço seguinte (linhas ~1296-1312) que lança `CM<x>` em **dias úteis livres**, respeitando `espacoLivreNoDia` (16h físicas/dia, descontando plantões e afastamentos).

Comportamento após a correção:
- Plantão `234` (D) + `1` (D+1) permanece intacto: 24h exatas.
- Carga mensal faltante é fechada **só** com `CM` em dias úteis em que o militar está realmente livre.
- Se ainda assim faltar carga (sem dia útil livre), o alerta atual `"faltam Xh — sem dia livre p/ CM"` continua sendo emitido — o usuário decide o que fazer.
- A etapa 6 (sanidade ≤24h/dia) e a etapa 7 (validação de descanso 12h) continuam atuando.

## Impacto

- Some o caso `234 + CM + HE` no mesmo dia.
- AK volta a bater com a carga mensal calculada (sem células vermelhas indevidas).
- Nada muda na geração de plantões, distribuição de HE de cobertura, equalização, viradas do mês anterior ou regras de afastamento.

## Arquivo a alterar

- `src/utils/escala.functions.ts` — remover o bloco de "CM no dia do plantão + HE de fechamento" dentro da etapa 5.
