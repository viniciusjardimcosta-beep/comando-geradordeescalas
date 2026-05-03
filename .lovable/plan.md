## Ajuste pontual

Em `src/utils/escala.functions.ts`, função `lancaServico24`, caminho normal (linhas 825–877), adicionar **uma única regra** antes do cálculo atual:

> Se o saldo de carga ordinária mensal restante for **menor que 6h** (menos que um turno), **não abrir turno ORD**. Lançar exatamente esse saldo como **CM** no dia e completar o resto do serviço (16h dia + 8h madrugada) com **HE**.

Pseudocódigo:

```text
espacoOrd = cargaMaxOrd(m) - horasOrdinariasAcumuladas(m)

se espacoOrd > 0 e espacoOrd < 6:
   CM(dia)   = espacoOrd
   HE(dia)   = 16 - espacoOrd
   se não for último dia:
      HE(dia+1) = 8
   return

// senão segue exatamente o fluxo atual (turno ORD válido + CM resto + HE excedente)
```

## Resultado

- Antonio Flores dia 18 com 5h de saldo → `CM5 + HE11` no dia + `HE8` na madrugada.
- AK deixa de ficar vermelha.
- Nenhuma outra parte do código é tocada.

## Arquivo

- `src/utils/escala.functions.ts` — apenas o início do bloco normal de `lancaServico24`.