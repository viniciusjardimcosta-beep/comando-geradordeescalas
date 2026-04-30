## Ajustes finais no motor de escala

Três correções pontuais em `src/utils/escala.functions.ts`. Nenhuma mudança de schema, UI ou banco.

### 1. Não usar militares fora do cadastro

Hoje, quando um nome aparece na aba "Efetivo" da planilha mas não existe no banco de dados do usuário, o sistema o trata como "BM comum" e o utiliza para preencher a escala. Isso fez com que um militar não cadastrado fosse escalado.

Mudança no bloco que monta `militares: MilitarRT[]` (em torno da linha 806):

- Se `cad` for `undefined` (militar da planilha não está no cadastro), marcar `ativo = false`. O motor já filtra por `m.ativo` em `elegivel()` e na etapa de HE, então ele simplesmente não será considerado para preencher escalas.
- Coletar esses nomes em uma lista local e emitir **um único alerta info consolidado no final**: "X militar(es) da planilha não estão cadastrados e foram ignorados: Fulano, Beltrano, …" — em vez de um alerta por militar.
- A linha do militar continua existindo na planilha (preserva o layout), mas não recebe lançamentos automáticos.

### 2. Alertas de expediente ADM consolidados

Hoje, no bloco 6.2 (expediente ADM), cada `ia.lancamentos.push({ ... EXP9/EXP6 ... })` gera mais tarde — na etapa 2 do motor (linha ~469) — um alerta por dia: "Lançado EXP9 (EXP) em 1 militar(es) nos dias 4". Como são ~22 dias úteis × N militares ADM, vira muito ruído.

Mudança:

- Marcar os lançamentos sintéticos de expediente ADM com uma flag interna (`__silent: true`) ou agrupá-los antes de empurrar para `ia.lancamentos`.
- No motor (etapa 2), pular `alertas.push(...)` quando o lançamento for sintético.
- Substituir pelo alerta já existente no fim do bloco 6.2 ("Expediente ADM aplicado a N militar(es): …") — porém reformulado para listar os nomes:
  "Expediente lançado para: Cap Silva, Sgt Souza, … (EXP9 seg-qui, EXP6 sex; sem fins de semana/feriados)."

Para lançamentos vindos da IA do usuário (não-sintéticos), o alerta atual continua: "Lançado HE2 (HE) em 3 militar(es) nos dias 4,11,18." — esse comportamento é desejado.

### 3. Alertas de "faltou militar" só no final

Hoje, na etapa 3 (escalar()), quando o motor não consegue completar CG/COV/total no dia, emite imediatamente:
- "Dia 12: faltou CG (mínimo 1)."
- "Dia 12: faltou COV (mínimo 1)."
- "Dia 12: guarnição ordinária ficou abaixo do mínimo; será tentado complemento por HE."

A etapa 4 (HE) frequentemente resolve esses furos, mas os alertas anteriores ficam no histórico mesmo quando o problema foi corrigido.

Mudança:

- Trocar os 3 `alertas.push({ tipo: "warn", … })` da etapa 3 por uma marcação interna (ex.: `breakControl = true`) só para sair do `while`, sem emitir alerta.
- Manter apenas o alerta da etapa 4 — "Dia X: ainda faltam Y militar(es) — sem HE elegível disponível." — que é emitido **depois** da tentativa de complemento e representa um furo real, não resolvido.
- Adicional: trocar esse alerta final por warn consolidado por dia continuando como está, já que cada dia que ficou furado é informação útil distinta.

### Validação esperada após os ajustes

- Militar que aparece só na planilha não recebe nenhum lançamento e gera 1 alerta info consolidado.
- Histórico passa a ter no máximo 1 alerta por militar ADM (nome listado), em vez de ~22.
- Alertas warn de "faltou" só aparecem para dias em que nem ordinária nem HE conseguiram cobrir.

### Arquivos tocados

- `src/utils/escala.functions.ts` (apenas — bloco 6.2, etapa 3 do `escalar()`, montagem de `militares`).
