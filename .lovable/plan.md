## Problema

Soldado Antonio Flores no dia 18: o sistema lançou a cobertura como **HE16** puro, fazendo a carga ORD/CM mensal estourar (AK em vermelho). O correto seria **CM5 + HE11** — usar primeiro o espaço de ORD que ainda faltava para fechar a carga mensal, e só o restante como HE.

## Causa raiz

Em `src/utils/escala.functions.ts`, função `lancaServico24` (linhas 776–861).

Quando o militar é escalado **para tapar furo** (etapa 4 — `destinoHe = true`, linha 1025), o código vai para o caminho rápido das linhas **793–803**:

```
if (destinoHe) {
  const restanteHe = limiteRestanteHe(m);
  const heDia = Math.min(16, restanteHe);
  ...
  setHe(dia, heDia);   // joga TUDO como HE
  ...
  return;
}
```

Esse caminho **ignora completamente o espaço de ORD ainda disponível** no mês (`tetoOrd - usadoOrd`). Resultado: mesmo que o militar ainda tenha 5h de carga ordinária para fechar o mês, a cobertura é lançada 100% como HE — e a etapa 5 depois não consegue mais lançar CM (o dia já está ocupado por HE), então a carga mensal fica abaixo do alvo OU, em outros casos, há ORD em outros dias que estoura o teto e fica vermelho.

O caminho normal (não-furo, linhas 805–860) já faz a coisa certa: calcula `espacoOrd` e só converte em HE o que passa do teto. Falta replicar essa mesma lógica na cobertura.

## Correção

Em `src/utils/escala.functions.ts`, dentro de `lancaServico24`, no bloco `if (destinoHe)` (linhas 793–803):

1. Calcular `espacoOrd = max(0, cargaMaxOrd(m) - horasOrdinariasAcumuladas(m))` antes de jogar tudo como HE.
2. Particionar a jornada de cobertura em **16h dia + 8h madrugada** (16h só, se for o último dia do mês), exatamente como o caminho normal já faz quando não cabe um 234 cheio.
3. Para cada bloco físico (dia e madrugada), preencher primeiro com **CM** até esgotar `espacoOrd`, e o que sobrar vira **HE** (respeitando `limiteRestanteHe`).

Pseudocódigo da nova partição do bloco `destinoHe`:

```text
horasDia      = 16
horasMadrugada = ultimoDia ? 0 : 8
espacoOrd     = max(0, cargaMaxOrd(m) - horasOrdinariasAcumuladas(m))
restanteHe    = limiteRestanteHe(m)

// Dia
cmDia = min(horasDia, espacoOrd)
heDia = min(horasDia - cmDia, restanteHe)
setCm(dia, cmDia);  setHe(dia, heDia)
espacoOrd -= cmDia;  restanteHe -= heDia

// Madrugada (se não for último dia)
cmMad = min(horasMadrugada, espacoOrd)
heMad = min(horasMadrugada - cmMad, restanteHe)
setCm(dia+1, cmMad);  setHe(dia+1, heMad)
```

Resultado para o cenário do Antonio Flores no dia 18 (16h, com 5h de ORD ainda disponíveis no mês): `CM5` + `HE11` no dia 18 — exatamente o esperado. Carga mensal fecha sem estourar; AK deixa de ficar vermelho.

## Impacto

- Coberturas de furo passam a respeitar a carga mensal e usar CM antes de HE.
- Plantões 234 + 1 (caminho não-`destinoHe`) seguem inalterados.
- Etapas 5 (acerto de CM em dias livres) e 6 (sanidade ≤24h/dia) seguem funcionando — ficam apenas com menos trabalho a fazer.
- Equalização de HE no mês melhora indiretamente, porque deixa de inflar HE quando havia ORD a fechar.

## Arquivo a alterar

- `src/utils/escala.functions.ts` — bloco `if (destinoHe)` dentro de `lancaServico24` (linhas 793–803).