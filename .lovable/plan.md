## Objetivo

Resolver dois problemas observados na escala de Maio/2026:

1. **Virada do mês anterior**: hoje a IA aplica a virada (último plantão do mês anterior continuando no dia 01) só quando o usuário escreve isso nas observações livres, e em alguns casos o motor está lançando **HE no dia 01** para essa guarnição quando o correto é **somente 8h** (turno `1` na linha ORD/EFE + `CM2` na linha EXP/COM). Falta uma forma simples e explícita do usuário marcar quem foi a última guarnição do mês anterior.
2. **Militares ADM** estão fechando o mês com horas trabalhadas **abaixo da carga horária mensal** (ex.: 27h vs 176,7h) porque o expediente padrão (EXP9 seg-qui + EXP6 sex) nem sempre soma exatamente o alvo do mês — o motor não está completando a diferença com `EXP{n}` extra.

---

## Mudanças

### 1) UI — Caixinha de "Última guarnição do mês anterior" na tela Importar

Em `src/routes/app.importar.tsx`, dentro do modal "Observações para gerar a escala", **antes** do textarea de observações livres:

- Nova seção **"Virada do mês anterior"** com:
  - Lista (checkboxes) dos militares **operacionais** do quartel (busca rápida em `militares` filtrando `tipo_escala = '24h'` e `is_adm = false`), agrupados por função (CG/COV/Demais), com campo de busca por nome/matrícula.
  - Para cada militar marcado, um pequeno seletor de **tipo do plantão do dia 31 (ou último dia)**: `ORD` (padrão) ou `HE` — porque a regra muda:
    - `ORD` → dia 01: `1` (ORD/EFE) + `CM2` (EXP/COM) = 8h, e bloqueia ORD nos dias 1 e 2.
    - `HE`  → dia 01: `HE8` apenas, e bloqueia ORD nos dias 1 e 2.
  - Texto curto explicando: "Marque os militares que estavam de serviço no último dia do mês anterior. Eles iniciarão o mês apenas com 8h (00h–08h) e ficarão de folga em 01 e 02."

- Ao gerar, esses dados são enviados ao server function como um novo campo `viradaAnterior: { militarId: string; tipo: "ord" | "he" }[]`.

### 2) Server function — receber virada explícita e priorizar sobre IA

Em `src/utils/escala.functions.ts`:

- Adicionar `viradaAnterior` ao `inputValidator` do `gerarEscala` (zod opcional, default `[]`).
- No início do motor (antes da etapa que aplica `ia.viradaAnterior`), injetar essas viradas explícitas convertendo `militarId → matrícula/nome` e marcando como prioridade absoluta. **Se um militar vier marcado pela UI, ignora qualquer virada inferida pela IA para o mesmo militar** (evita duplicidade).
- **Bug fix**: garantir que após aplicar a virada (tipo `ord` ou `he`), o militar fique **bloqueado para qualquer outro lançamento (ORD/HE) nos dias 01 e 02**, e que o cálculo de horas (`m.cargaH`) some apenas 8h — nunca mais. Hoje em alguns cenários o motor consegue empilhar HE no dia 01 porque o bloqueio só cobre ORD; ampliar para cobrir HE também no dia 01 quando a virada está aplicada.

### 3) Motor — completar carga horária dos ADM com EXP extra

Hoje o passo 6 (ADM) só lança `EXP9` (seg-qui) e `EXP6` (sex). O passo 5 (acerto de carga) está com `if (!m.ativo || m.isAdm) continue;` — ou seja, ADM é ignorado.

Mudanças em `src/utils/escala.functions.ts`:

- **Não pular ADM no passo 5**. Para militares ADM, calcular:
  - `horasExp = soma de EXP{n} + CM{n} já lançados` (a função `horasOrdMes` precisa ser estendida ou criar `horasExpMes(m)` que lê a linha EXP/COM e converte siglas em horas).
  - `cargaMin = cargaBase(dias) * (1 - diasAfastado/dias)` (mesma fórmula).
  - Se `horasExp < cargaMin`, distribuir o `faltam` em **dias úteis livres** (sem feriado, sem afastamento, sem EXP já lançado naquele dia) usando siglas `EXP{n}` na linha **EXP/COM**, valor `n` entre 1 e 12 (no máx EXP12 por dia). Exemplo do enunciado: faltam 3h → `EXP3` em um dia; faltam 15h → `EXP12` num dia + `EXP3` em outro.
  - Se já existe `EXP9`/`EXP6` no dia, **somar** (substituindo pela soma, se ≤ 12) em vez de pular — assim conseguimos cobrir os casos em que a folga deixa o militar abaixo da meta. Limite máximo por dia: 12h.
  - Reportar em `alertas` (info): `"Expediente complementar lançado: <nome> (+Xh em N dia(s))"`.

- Para militares operacionais (não-ADM), **manter** o comportamento atual (CM + serviços parciais) — não mexer.

### 4) Persistência (opcional, recomendado)

- Salvar a lista de virada selecionada em `escalas_geradas.parametros.viradaAnterior` para auditoria.
- Não precisa migration: `parametros` já é `jsonb`.

---

## Detalhes técnicos

### Tipos

```ts
// src/utils/escala.functions.ts (input validator)
viradaAnterior: z.array(z.object({
  militarId: z.string().uuid(),
  tipo: z.enum(["ord", "he"]).default("ord"),
})).default([])
```

### Fluxo de bloqueio (resumo)

```text
militar marcado virada-ORD:
  dia 01 ORD/EFE  = "1"     (+6h)
  dia 01 EXP/COM  = "CM2"   (+2h)
  dia 01 HE       = bloqueado
  dia 02 ORD/EFE  = bloqueado
  dia 02 HE       = bloqueado (folga 12h pós-plantão)
  cargaH += 8

militar marcado virada-HE:
  dia 01 HE       = "HE8"   (+8h)
  dia 01 ORD/EFE  = bloqueado
  dia 02 ORD/EFE  = bloqueado
  cargaH += 8
```

### ADM — algoritmo de complemento

```text
para cada ADM:
  exp_atual = soma das siglas EXP*/CM* já lançadas
  alvo      = cargaBase(dias) ajustado por afastamento
  faltam    = alvo - exp_atual
  enquanto faltam > 0 e existir dia útil disponível:
    pega próximo dia útil sem afastamento
    h_existente = sigla atual nesse dia (0 se vazia)
    h_disponivel = 12 - h_existente
    h = min(faltam, h_disponivel)
    se h > 0:
      grava EXP{h_existente + h} no dia
      faltam -= h
```

### Arquivos a alterar

- `src/routes/app.importar.tsx` — nova seção no modal, fetch de militares, estado, envio.
- `src/utils/escala.functions.ts` — input validator, aplicação prioritária da virada UI, bloqueio HE no dia 01, complemento de carga para ADM.

Sem migrations, sem mudanças em outras telas.
