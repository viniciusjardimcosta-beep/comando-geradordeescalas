## Objetivo

Refinar `lancaServico24` em `src/utils/escala.functions.ts` para que, quando o saldo ORD do mês for menor que o plantão 24h, o sistema lance **CM exatamente com o saldo faltante** e converta o restante do plantão em **HE**, em vez de tentar encaixar uma sigla ORD parcial (`23`/`2`).

A unidade de comparação é o **plantão 24h inteiro** (16h dia + 8h madrugada; 16h no último dia do mês).

## Regra final

```
saldo       = cargaMaxOrd(m) - horasOrdinariasAcumuladas(m)
horasTurno  = ultimoDia ? 16 : 24
horasDia    = 16  (ou cabeOrdCheio? 18)
horasMad    = ultimoDia ? 0 : 8  (ou cabeOrdCheio? 6)

SE saldo >= horasTurno
   → manter caminho atual: lança plantão ORD cheio (sigla "234" + "1")
SE saldo <= 0
   → manter caminho atual: tudo HE (respeitando limiteRestanteHe)
SENÃO  (0 < saldo < horasTurno)
   → CM(saldo) distribuído entre dia e madrugada
   → HE(horasTurno - saldo) preenchendo o restante físico, limitado por limiteRestanteHe
   → não usar sigla ORD parcial (23/2)
```

Distribuição de CM quando `0 < saldo < horasTurno`:
- `cmDia  = min(saldo, horasDia)`
- `cmMad  = saldo - cmDia` (sempre 0 quando saldo ≤ 16)
- `heDia  = min(horasDia - cmDia, restanteHe)`
- `heMad  = min(horasMad - cmMad, restanteHe - heDia)` (se não for último dia)

## Mudanças no código

Arquivo único: `src/utils/escala.functions.ts`, função `lancaServico24` (linhas ~807-934).

1. Remover o ramo especial `espacoOrd > 0 && espacoOrd < 6` (linhas 863-881) — torna-se caso particular da nova regra geral.
2. Substituir o bloco "encaixe parcial de sigla ORD" (linhas 883-931) pela ramificação acima:
   - **Ramo A — saldo cobre plantão cheio**: mantém a lógica atual de `cabeOrdCheio` (sigla `234` + `1`) usada quando `espacoOrd >= 18` e não é último dia. Para `ultimoDia` com `espacoOrd >= 16`, lança `23` (12h) + CM4 — manter essa exceção atual ou simplificar para CM16? Será CM16 puro pela nova regra (sem sigla ORD parcial).
   - **Ramo B — saldo zero**: tudo HE, igual hoje (linhas 890-900).
   - **Ramo C — saldo parcial**: aplica CM(saldo)+HE(resto) conforme distribuição acima.
3. Não alterar o caminho `destinoHe` (cobertura de furo, linhas 829-854) — ele já segue exatamente a regra `CM até espaço ORD + HE no resto`.
4. Não alterar critérios de elegibilidade, ordenação, cooldown nem limites de HE.

## Garantias

- Saldo ORD nunca é ultrapassado por sigla ORD (já que ORD só é lançada quando cabe o plantão inteiro).
- CM fecha exatamente o saldo restante quando o militar é escalado num dia em que o turno excede a capacidade.
- HE só aparece após esgotar o saldo ORD do mês.
- Teto mensal de HE (`limiteRestanteHe`) continua respeitado.

## Validação

- Build do projeto.
- Inspeção mental dos casos: saldo=24, saldo=18, saldo=16, saldo=10, saldo=4, saldo=0; com e sem `ultimoDia`.