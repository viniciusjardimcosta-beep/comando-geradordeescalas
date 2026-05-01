
# Corrigir lançamento de HE: tudo acima da carga mensal vira HE

## Problema atual

O motor está fazendo duas coisas erradas:

1. **Escalas ordinárias (24x72)**: o motor escolhe militares pelo grupo da vez sem verificar se o militar já fechou as 177h do mês. Se ele já tem 177h ORD acumuladas e entra de novo no plantão, esse plantão é lançado como **ORD (234 + 1)** — que era o que o usuário viu como "turnos aleatórios depois de fechar a carga".
2. **Quebra de escala (cobrir furo de outra guarnição)**: também cai como ORD se o militar ainda não fechou as 177h, porque a etapa de "tapar furo com HE" só age quando faltam militares no dia. Quando o substituto chega a furar a própria carga, vira ORD ao invés de HE.

A 5ª etapa (acerto de carga mensal) tenta remediar somando HE em cima do plantão que já existe na linha ORD — gera o efeito visual de "HE colada em dias aleatórios pra informar quantas HE foram feitas". Não é o que se quer.

## Regra correta (palavras do usuário)

> Tudo que for lançado depois de ultrapassar a carga horária mensal prevista para o militar deve ser lançado como HE. Ex.: mês de 177h, militar fechou 177 com turnos+CM → a hora 178 já é HE1, 179 é HE2, e assim por diante.

Carga base por dias do mês (já existe em `cargaBase()`):

```text
28 dias → 160h
29 dias → 165h
30 dias → 171h
31 dias → 177h
```

Para militares afastados parte do mês, a carga é proporcional: `cargaBase * (1 - diasAfastado/dias)`.

## Mudanças no motor (`src/utils/escala.functions.ts`)

### 1. Calcular o teto de ORD por militar uma vez, no início

Criar `cargaMaxOrd(m)` que devolve a carga prevista do mês descontando os afastamentos já aplicados na 1ª etapa. Esse valor é o teto absoluto de horas que o militar pode acumular na linha ORD.

### 2. Plantão 24h: decidir ORD ou HE no momento da escolha (etapa 3 do motor, linhas 707-802)

Reescrever `lancaServico24(m, dia, destinoHe)` e o laço da 3ª etapa:

- Antes de chamar `lancaServico24(m, dia)`, calcular se a carga ORD atual do militar + 24h ≤ `cargaMaxOrd(m)`.
- Se **cabe**: lança normal como ORD (`234` no dia D + `1` no dia D+1).
- Se **estoura**: lança o plantão inteiro como HE (`HE16` em D + `HE8` em D+1), respeitando o teto de HE da 6ª seção (`limiteRestanteHe(m)`). Se o teto de HE não permite o bloco completo, fragmenta usando a lógica atual (`escalaHeCheio`) ou desiste do candidato e passa pro próximo.
- Caso especial: se cabem só 6h ORD antes de estourar (ex.: militar com 171h, mês de 177), lança `2` (6h ORD) em D + `HE8` na madrugada. Mantém a cobertura física de 24h da guarnição com a parte excedente sendo HE.

Isso elimina o cenário "militar é escalado normalmente como ORD e depois ganha um HE16/HE8 colado pra equilibrar".

### 3. Quebra de escala (cobrir furo) — etapa 4 (linhas 807-912)

A etapa atual já lança HE para tapar furo. Manter o comportamento, mas garantir que **nunca** vire ORD: a função que tapa furo só pode usar `he`, nunca `ord`. Hoje já é assim — só precisa garantir que o substituto sempre passe por aqui mesmo quando ele ainda tem espaço de carga (porque ele já está fora do grupo da vez). Adicionar comentário explicativo.

### 4. Etapa 5 (acerto de carga mensal, linhas 1084-1128)

Esta etapa fica **muito mais simples**:

- O caso "carga ORD > cargaMin" praticamente desaparece, porque a etapa 3 já não deixa estourar. Se ainda assim sobrar excedente (por causa de exceções `obrigatorio` ou afastamentos vindos depois), a lógica atual de converter em HE no plantão real continua valendo como fallback.
- O caso "carga ORD < cargaMin" (faltante) continua igual: lança CM puro até bater a carga, sem mexer em HE.

### 5. Etapa de equalização/teto de HE (`limitesHe`)

Continua funcionando: o teto de HE imposto pelo usuário (ex.: "máximo 24h HE para sgts") agora é avaliado **no momento da escolha do plantão**, não só no fim. Se o militar atingiu o teto de HE e a carga ORD também já está cheia, ele simplesmente não é candidato — o motor escolhe outro.

### 6. Alertas

- Substituir o alerta atual `Excedente da carga mínima lançado como HE nos plantões reais` por:
  - `info`: `Plantão lançado como HE para X (carga mensal de Y/Y h fechada — horas excedentes viraram HE).`
- Manter alerta de furo se nenhum militar elegível couber nem em ORD nem em HE.

## O que NÃO muda

- Plano de férias e outros afastamentos (já vêm da etapa 1, intactos).
- Escala ordinária 24x72, rotação por grupo, regra 24x72, folga 12h.
- Lançamentos manuais via observações (HE/EXP/ORD diretos).
- Virada do mês anterior (CM2 + ORD 1, ou HE8).
- Proteção de fórmulas e validação final de descanso.
- Geração do XLSX (a etapa 7 só renderiza o que o motor decidiu).

## Riscos / pontos de atenção

- **Cobertura física da guarnição**: a regra de quebrar plantão em "ORD parcial + HE" preserva 24h físicos no dia. Casos onde o teto ORD permite só 0h do plantão (militar já estourou) são lançados 100% HE (HE16+HE8) — guarnição segue completa.
- **Último dia do mês**: continua valendo a regra `234` = 18h e a madrugada `1` cai no próximo mês. A nova lógica respeita isso.
- **Teto de HE configurado pelo usuário**: pode levar a furo de guarnição se TODOS os elegíveis já estouraram ORD e bateram o teto de HE. O alerta `error` de furo CG/COV continua sendo emitido.

## Validação

Depois da mudança, o usuário deve repetir a geração com a mesma planilha de teste e verificar:

1. Nenhum militar deve aparecer com soma ORD > 177h (em mês de 31 dias).
2. Plantões a partir do limite devem aparecer como `HE16`+`HE8` no par de dias, sem ORD `234`+`1` no mesmo par.
3. Quebras de escala (substitutos) sempre na linha HE.
4. Sem mais "HE solta em dia aleatório" colada num plantão ORD que já existe.
