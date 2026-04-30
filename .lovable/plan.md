## Carga horária mensal: complemento (CM) e excedente como HE

Ajustes pontuais em `src/utils/escala.functions.ts` para garantir que **todo militar fecha a carga horária mensal mínima** e que **toda hora ordinária acima do limite vira HE** automaticamente. A planilha já tem as fórmulas para somar/avaliar — o motor só precisa lançar as siglas corretas.

### Carga mínima de referência (já existente nas fórmulas da planilha)

O motor **não** vai recalcular este número (a planilha já faz). Vai usá-lo apenas como alvo interno, derivado por dias do mês e descontando férias/afastamentos do próprio militar:

| Dias no mês | Carga mínima base |
|---|---|
| 28 | 160h |
| 29 | 165h |
| 30 | 171h |
| 31 | 177h |

Desconto por afastamento: cada dia de FER/LTS/LGE/LPA/LNJ/CA/DIS/AFM no mês reduz a carga base proporcionalmente (`base × (1 − diasAfastado/diasMes)`, arredondado para inteiro). Isso replica o que a planilha já faz, só para o motor decidir quem precisa de complemento.

### Como o motor decidirá lançar (após a 4ª etapa atual)

Adicionar uma **5ª ETAPA — Acerto de carga horária** logo após a etapa de HE existente, que roda 1× por militar:

```text
para cada militar ativo (não ADM):
  cargaMin = base(dias) ajustada por afastamentos
  cargaMax = 24 × (nº de serviços de 24h escalados a ele no mês)
  cargaOrd = soma das horas em ORD (cada serviço 24h = 24h)

  se cargaOrd > cargaMin:
     converter o excedente em HE (ver bloco "Excedente vira HE")
  se cargaOrd < cargaMin:
     lançar CM no último serviço do mês (ver bloco "CM no último serviço")
```

### CM no último serviço (preencher faltantes)

Exemplo do usuário: militar tem 170h de 177h previstas, ainda tem 1 serviço 24h no fim do mês.

- Horas faltantes = `cargaMin − cargaOrd` (ex.: 7h).
- No **último dia em que o militar está em ORD** (24h):
  - linha **ORD** mantém o turno parcial: sigla `2` (08–14, 6h) ou outra fração que cubra exatamente as horas que ainda contam como ordinária — para o caso típico de 1–8h faltantes, usar `2` (6h) ou `23` (12h) escolhendo a maior fração que **não ultrapasse** `cargaMin`.
  - linha **EXP** recebe `CM<faltantes>` (ex.: `CM1` = 7h, `CM2` = 8h…). A tabela `CM1..CM16` já existe em `SIGLAS_COMP_VALIDAS`.
  - As horas restantes do serviço de 24h (24 − ordinárias − CM) viram HE no mesmo dia + dia seguinte (ex.: `HE9` no dia + `HE8` no D+1), igual ao padrão atual de `HE18+HE6`, mas com tamanho calculado.

Mapeamento de turnos parciais (ORD) já suportados pela planilha:
- `2` = 08–14 (6h)
- `3` = 14–20 (6h)
- `23` = 08–20 (12h)
- `234` = 08–02 (18h)
- `2341` (atual) = 24h cheias

O motor escolhe o maior turno cujo total + CM não ultrapasse `cargaMin`, e o resto até completar 24h da presença física vira HE.

Se o militar **não tem nenhum serviço 24h restante** e ainda falta carga (ex.: militar afastado quase o mês todo, mas com poucos dias livres no fim), o motor força um lançamento avulso `CM<faltantes>` na linha EXP em um dia útil livre dele. Alerta `info`: "Militar X recebeu CMx avulso para fechar carga (Yh)".

### Excedente vira HE

Se após a etapa 3 + 4 o militar acumula serviços 24h que somam mais que `cargaMax = cargaMin` (ou o teto da planilha — usar `cargaMin` como teto, conforme o usuário: "tudo que extrapolar"):

- Pegar o **último serviço 24h escalado** dele.
- Reduzir a sigla ORD para a fração que cabe dentro de `cargaMin` (ex.: `cargaOrd` = 192h, `cargaMin` = 177h → excedente 15h: ORD vira `2` (6h) e os 18h restantes do plantão viram `HE12` no dia + `HE6` no D+1; ou redistribuir conforme tabela de turnos).
- Lançar HE correspondente nas linhas HE do mesmo militar nos mesmos dias.

Isso significa que **a HE pode aparecer mesmo que o usuário não tenha pedido nenhuma HE explícita** — é a previsão automática, conforme solicitado.

### Alertas consolidados no fim

- 1 alerta `info` listando militares que receberam CM para fechar carga: `"Complemento de carga: Sgt X (CM2 dia 28), Cb Y (CM1 dia 30)…"`.
- 1 alerta `info` listando militares com excedente convertido em HE: `"Excedente convertido em HE: Sgt Z (15h dia 29)…"`.
- Manter alertas warn da etapa 4 (furos não resolvidos) como já está.

### Onde mexer (técnico)

- `src/utils/escala.functions.ts`:
  - novo helper `cargaMinimaMes(dias, diasAfastado)` retornando inteiro.
  - novo helper `lancarParcial(m, dia, horasOrd, horasCm, horasHe)` que escolhe siglas ORD/CM/HE corretas e atualiza `m.cargaH`.
  - nova **5ª etapa** dentro de `escalar()` após o loop de HE, percorrendo `militares` e ajustando lançamentos no último dia ORD do mês de cada um.
  - acumular nomes em arrays locais `acertosCm` e `acertosHe` para emitir 2 alertas consolidados no `handler` após `escalar()`.

Sem mudanças em UI, schema, banco ou no `xlsx-surgical.ts`.

### Validação esperada

- Militar com 170h e 1 serviço de 24h restante → ORD `2` (6h) + EXP `CM1` (7h) + HE `HE9`/`HE8` no dia/D+1. Total ordinário = 177h ✅.
- Militar com 6 serviços (144h) num mês de 31 dias (mín 177h) → recebe CMx avulso ou em algum dia parcial até fechar 177h.
- Militar com 8 serviços (192h) e mín 177h → último plantão tem ORD reduzida + 15h em HE.
- Militar de férias 15 dias num mês de 30 (mín base 171h, ajustada para ~85h) → carga mínima recalculada e CM/HE proporcional.
