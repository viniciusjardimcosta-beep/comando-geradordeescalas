## Diagnóstico (a partir da planilha enviada)

Contagem de militares em serviço por dia em `Anexo B - Escala`:

```text
dia  1: 4 ORD entrando + 4 ORD saindo (madrugada) + 4 HE = 12 entradas
dia  2: 4+4 ORD + 7 HE = 15 entradas
dia  3: 4+4 ORD + 8 HE = 16 entradas
dia  5: 4+4 ORD + 4 HE
dia  6: 4+4 ORD + 5 HE
...e por aí vai com sobra de HE em quase todo o mês
```

A guarnição mínima configurada é **4 militares por dia**. Os 8 ORD/dia são corretos (4 entrando às 18h + 4 saindo da madrugada anterior = mesma planilha mostra ambos). O excesso vem das **HE adicionais** colocadas em cima de plantões já completos.

## Causas no motor (`src/utils/escala.functions.ts`)

### 1. `estaEmServico24` ignora a madrugada como cobertura do dia (linha 709)

```ts
const estaEmServico24 = (m, dia) =>
  ord.get(dia)?.get(m.rowOrd) === "234" ||
  (dia < dias && ord.get(dia + 1)?.get(m.rowOrd) === "1");
```

A função conta o militar como "em serviço no dia D" se ele tem **234 em D** OU **1 em D+1** (entrada futura). Mas **não conta** os militares que estão saindo de plantão no dia D (têm `1` em D, vindos de `234` em D-1). Ou seja: os 4 militares que estão fisicamente cobrindo a guarnição das 00h às 06h do dia D não entram na contagem.

Resultado: a etapa 4 (tapar furo com HE) acha que o dia D tem só 4 militares quando, na verdade, há 4 entrando + 4 saindo. Como o usuário pediu "4 por dia", o motor erradamente acrescenta HE pra "completar". **Isso é a fonte principal das HE em excesso.**

### 2. Etapa 4 não respeita "HE só pra tapar furo real" (linhas 929-1037)

A regra do usuário: **HE só existe quando faltou ORD pra atingir os 4/dia**. Hoje a etapa 4 dispara sempre que `escalados24 < totalAlvo`, sem perguntar se essa lacuna seria coberta pela rotação ORD do dia seguinte ou da madrugada vinda do dia anterior.

### 3. `lancaServico24` emenda HE em dias onde já há ORD (linhas 798-808)

No caminho híbrido (ORD parcial + HE), o código faz:

```ts
const cur = he.get(dia)?.get(m.rowOrd);
const ja = cur ? (parseInt(cur.replace(/\D/g, ""), 10) || 0) : 0;
he.get(dia)!.set(m.rowOrd, `HE${ja + heD}`);
```

Isso **soma** HE em cima de qualquer HE pré-existente no mesmo militar/dia. Combinado com a etapa 4 disparando indevidamente, gera lançamentos do tipo `234 + HE6` no dia D **e** `1 + HE8` em D+1 — duplicando 24h físicas em um plantão que já estava completo.

## Correções

### Correção 1: contar a saída da madrugada como cobertura (etapas 3 e 4)

Reescrever `estaEmServico24` para refletir a cobertura física real do dia:

```ts
const estaEmServico24 = (m, dia) =>
  ord.get(dia)?.get(m.rowOrd) === "234" ||      // entra no dia D
  ord.get(dia)?.get(m.rowOrd) === "1";          // sai de plantão no dia D (madrugada)
```

A condição `ord.get(dia+1)?.get === "1"` que olhava pra frente vira redundante e pode ser removida.

Efeito: a etapa 4 só dispara quando faltam militares **de fato** para fechar 4/dia.

### Correção 2: etapa 4 só age se há furo físico real

Manter a etapa 4, mas com o `escalados24` corrigido (acima). Adicionar guarda explícita:

```ts
const escalados24 = militares.filter(m => estaEmServico24(m, dia)).length;
const faltam = totalAlvo - escalados24;
if (faltam <= 0) continue;   // já satisfeito pela rotação ORD — sem HE
```

Já existe esse `continue`, mas com a correção 1 ele passa a funcionar. Garantir também que CG/COV mínimos só forcem HE se realmente faltar (já é o caso, só precisa de `estaEmServico24` correto).

### Correção 3: `lancaServico24` nunca somar HE em cima de HE existente

No bloco híbrido (linhas 798-808):

```ts
if (heD > 0 && !he.get(dia)!.has(m.rowOrd)) {
  he.get(dia)!.set(m.rowOrd, `HE${heD}`);
  m.cargaH += heD;
}
if (heMad > 0 && !he.get(dia + 1)!.has(m.rowOrd) && !ord.get(dia + 1)!.has(m.rowOrd)) {
  he.get(dia + 1)!.set(m.rowOrd, `HE${heMad}`);
  m.cargaH += heMad;
}
```

Se já existe HE no slot, o motor **não escala** esse militar pra plantão híbrido — escolhe outro candidato. Isso impede lançar `234+HE6` em alguém que já recebeu HE da etapa de furo.

### Correção 4: ordem das etapas

Hoje: etapa 3 (ORD) → etapa 4 (HE). Está correto. Garantir que a etapa 4 nunca volte ao mesmo dia depois que a etapa 3 já fechou os 4/dia, e que a etapa 5 (acerto de carga) também só lance CM/HE em **dias livres** do militar (já é o caso, função `diaLivreParaLancamento`).

## Validação esperada

Após as correções, na mesma planilha:

1. Cada dia operacional terá **exatamente 4 militares físicos** cobrindo (4 entradas de `234` + 4 saídas `1` da madrugada anterior, mas eles são os mesmos militares contados uma vez no físico).
2. **Zero HE** nos dias em que a rotação ORD já preenche os 4/dia. HE só aparece em dias com afastamento massivo ou férias que reduzem o efetivo abaixo de 4.
3. Soma `HorasTrab − CargaMensal = HE` da planilha bate exatamente com a soma de células HE.
4. Nenhum militar com `234+HE6` no mesmo dia ou `1+HE8` em D+1 do mesmo plantão.

## Arquivo modificado

- `src/utils/escala.functions.ts` — três pontos: `estaEmServico24` (linha 709), bloco híbrido de `lancaServico24` (linhas 798-808), e checagem da etapa 4. Demais etapas (1, 2, 5, 6) e geração XLSX (etapa 7) ficam intactas.
