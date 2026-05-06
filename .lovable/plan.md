# Refatoração do motor de escala — fluxo sequencial rígido

## Objetivo

Reproduzir o comportamento do escalante humano: primeiro montar a escala 24x72 base sem interferência, depois corrigir buracos. A escala ordinária NUNCA pode ser alterada por correções posteriores.

## Fluxo alvo (substitui as etapas atuais 1–7 em `escalar()` de `src/utils/escala.functions.ts`)

### ETAPA 1 — Indisponibilidades
- Aplicar férias (plano anual), afastamentos da IA (FER, LTS, LAA, F, RDC etc.) e virada do mês anterior.
- Esses dias bloqueiam o militar para qualquer lançamento ordinário.
- NÃO substituir ninguém aqui.

### ETAPA 2 — Escala ordinária 24x72 completa
- Para cada grupo (A, B, C, D = `escalas_ordinarias.ordem`), gerar a sequência de plantões 24h respeitando o ciclo 24×72 (1 dia de serviço + 3 de folga).
- Lançar `234` no dia D + `1` no dia D+1 para todo militar do grupo da vez, **mesmo se houver indisponibilidade no dia** (nesse caso só pula o militar individual indisponível, sem repor).
- Preencher TODOS os dias do mês.
- **Não** olhar para mínimos de CG/COV nesta etapa. **Não** chamar nenhum candidato fora do grupo da vez.
- Carga ordinária acumulada do mês continua sendo respeitada por militar (teto = `cargaMensalProporcional`).

### ETAPA 3 — Retorno de afastamento
- Quando o afastamento termina, o militar volta automaticamente ao ciclo do seu grupo original a partir do próximo plantão programado daquele grupo.
- Sem rotacionar grupos, sem ajustar ciclo.

### ETAPA 4 — Diagnóstico (sem escrever)
- Para cada dia, contar:
  - total de militares em serviço 24h iniciado naquele dia,
  - presença de CG (≥ `minCg`),
  - presença de COV (≥ `minCov`).
- Montar lista `furos[]` com (dia, faltam, falta_cg, falta_cov).

### ETAPA 5 — Correção dos buracos (sem mexer em ORD)
- Para cada furo, escolher militares **de outros grupos** elegíveis:
  - ativo, não-ADM, não-parcial,
  - sem ORD/HE/afastamento no dia e no dia anterior/seguinte (folga 12h),
  - dentro do teto mensal de HE,
  - sem violar `evitarFragmentar` quando aplicável.
- Estes militares são lançados **somente como HE**, nunca como ORD.

### ETAPA 6 — Hora extra
- Lançar HE16+HE8 (jornada cheia 24h) por padrão; fragmentar (HE6/HE8/HE12/HE16) só quando não couber HE cheio.
- Respeitar 12h de descanso e teto mensal de HE.

### ETAPA 7 — Acerto de carga (mantida)
- Apenas para fechar carga ordinária com **CM** (complementação) em dias úteis livres, respeitando o teto físico de 16h/dia.
- Nunca cria HE nesta etapa. Nunca toca em ORD já lançada.

### ETAPA 8 — Sanidade final + alertas (mantida)
- Garantir ≤24h físicas/dia, gerar alertas de furos remanescentes, conflitos de descanso e carga divergente.

## Mudanças concretas no código

Arquivo: `src/utils/escala.functions.ts`, função `escalar()`.

1. **Reescrever a etapa 3 atual** (loop `for (let dia = 1; dia <= dias; dia++)` que mistura ORD + HE no mesmo dia) em duas etapas separadas:
   - Etapa 2 nova: loop por grupo + ciclo 24×72, lançando só ORD do grupo da vez.
   - Etapa 4/5 nova: depois que todo ORD está pronto, varrer dias e tapar furos com HE.
2. **Remover** o fallback que hoje, ainda dentro do loop diário, chama `escolher("BM") ?? escolher("CG") ?? escolher("COV")` para completar `totalAlvo` com ORD de outro grupo. Isso vira HE na etapa 5.
3. **Manter** `lancaServico24` como está — já implementa a regra "fecha ORD até o teto, depois HE no mesmo serviço". Continua sendo usada **somente** pela etapa 2 (para o grupo da vez) e pela etapa 5 com `destinoHe = true`.
4. **Manter** etapa 7 (acerto de carga via CM) e etapa 8 (sanidade) sem mudança.
5. **Corrigir** `cargaMensalProporcional` para `Math.round(bruto)` em vez de `Math.floor(bruto)`. Motivo concreto: na última escala gerada, Sd Augusto (10 dias de férias em maio) recebeu alvo 119h (`floor(119,9)`) em vez de 120h, o que causou `CM5+HE1` no dia 26 em vez de fechar com `1` ordinário. Com `round` o alvo vira 120h e os 5 plantões fecham exatos.

## Fora do escopo

- Banco, UI, autenticação, importação XLSX (`xlsx-surgical.ts`).
- Renomeação de funções públicas.

## Validação

Após implementar:
1. Reimportar a planilha de Panambi (maio/2026) e confirmar:
   - Augusto: 5 plantões 234+1, sem CM5/HE1 no dia 26, total 120h ORD.
   - Nenhum militar recebendo ORD fora do seu grupo de rotação (A/B/C/D).
   - Furos de guarnição lançados como HE em militares de outros grupos.
2. Conferir alertas: não deve aparecer mais "ORD acima da carga mensal" para militares com afastamento.
