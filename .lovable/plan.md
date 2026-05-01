Analisei o Anexo B do arquivo enviado e você está certo: o erro principal é que o motor está tratando errado a representação dos turnos ordinários.

## O que o documento mostra

No arquivo enviado, o padrão correto dos turnos de 24h não é escrever tudo como um bloco único no mesmo dia. A planilha usa a lógica visual por dia:

```text
Dia D:     ORD/EFE = 234
Dia D + 1: ORD/EFE = 1
```

Ou seja:

- `2` = 08h–14h
- `3` = 14h–20h
- `4` = 20h–02h
- `1` = 02h–08h do dia seguinte

Então um serviço de 24h iniciado no dia 4 aparece como:

```text
Dia 4: 234
Dia 5: 1
```

E não deve ser tratado internamente como se `234` sozinho já valesse todo o serviço na planilha.

Também confirmei no documento o padrão de virada do mês anterior:

```text
Dia 1: ORD/EFE = 1
Dia 1: EXP/COM = CM2
```

Isso representa o final do serviço que começou no mês anterior, fechando a madrugada.

## Erro atual do sistema

O motor está misturando duas coisas diferentes:

1. **bloco operacional de 24h**;
2. **células reais que a planilha usa para calcular horas**.

Hoje o código ainda trata `234` como se fosse 24h em alguns cálculos internos e ignora o `1` do dia seguinte na contagem mensal. Isso pode até fechar a lógica interna do sistema, mas não bate com a fórmula real da planilha, que precisa enxergar os turnos lançados dia a dia.

Também aparece o problema que você apontou:

```text
Dia 28: ORD/EFE = 23
Dia 28: EXP/COM = CM4
```

Esse lançamento fecha apenas 16h no dia 28. Para manter o serviço físico de 24h, o sistema precisa lançar a continuação no dia seguinte:

```text
Dia 29: EXP/COM = CM8
```

Se isso não acontece, a madrugada de 00h às 08h fica descoberta para aquele militar.

Além disso, no arquivo enviado a linha `HE` está vazia nos militares analisados, mesmo havendo excesso de carga indicado nos totais. Isso confirma que o sistema não está escrevendo as horas extras no campo certo da planilha.

## Correção que vou implementar

### 1) Mudar a contagem interna para seguir a planilha
Vou corrigir a tabela de horas para a contagem mensal considerar exatamente o que está escrito em cada célula:

```text
ORD/EFE:
1   = 6h
2   = 6h
3   = 6h
4   = 6h
23  = 12h
234 = 18h
```

E o serviço completo será entendido como:

```text
234 no dia D + 1 no dia D+1 = 24h
```

O sistema não deve mais somar `234` como 24h e ignorar o `1` na contagem da planilha.

### 2) Separar “plantão operacional” de “lançamento em célula”
Internamente, o motor pode continuar entendendo que um militar entrou em um serviço de 24h, mas na hora de escrever e calcular precisa usar a forma da planilha:

```text
entrada do serviço: 234
saída/madrugada: 1
```

Isso evita erro na carga horária mensal e na fórmula do arquivo.

### 3) Corrigir serviços parcialmente convertidos em CM
Quando o sistema precisar ajustar um serviço para fechar carga, ele deverá preservar a continuidade física.

Exemplo correto:

```text
Dia 28 ORD/EFE: 23
Dia 28 EXP/COM: CM4
Dia 29 EXP/COM: CM8
```

O sistema não poderá deixar apenas `23 + CM4`, porque isso cobre só 16h.

### 4) Fazer a HE ser lançada na linha HE, não escondida em ORD/EXP
Quando o militar ultrapassar a carga mensal, o excedente precisa aparecer em:

```text
Linha HE: HE1, HE2, ..., HE24
```

O sistema deve lançar HE em dias reais de serviço, preferencialmente seguindo o padrão:

```text
Dia D: HE16
Dia D+1: HE8
```

ou frações menores quando necessário, respeitando o limite físico do dia e evitando quebrar demais quando você pedir para não fragmentar.

### 5) Recalcular o excedente usando a mesma lógica da planilha
Depois de montar ORD/EFE e EXP/COM, o motor vai recalcular:

```text
horas ordinárias reais + complementos + HE já lançada
```

Depois compara com a carga mensal alvo. Se passar da carga, o excesso será lançado no campo `HE`.

### 6) Respeitar teto e equalização de HE
As regras que você definir nas observações continuarão valendo:

```text
sargentos no máximo 24h de HE cada, equalizado
soldados equalizados na medida do possível, sem quebrar demais em horas pequenas
```

Se o teto impedir lançamento de HE, o sistema vai avisar claramente no alerta da escala.

### 7) Validações finais obrigatórias
Vou adicionar uma checagem final antes de salvar a planilha:

- se houver `234`, deve existir `1` no dia seguinte, exceto no último dia do mês;
- se houver `23 + CM4` como ajuste de um plantão de 24h, deve existir `CM8` no dia seguinte;
- se houver `HE16` de serviço 24h, deve existir `HE8` no dia seguinte;
- nenhum militar pode receber mais horas físicas em um dia do que a planilha comporta;
- a linha HE não pode ficar vazia quando houver excesso real de carga;
- a contagem interna do sistema deve bater com a lógica de turnos da planilha.

## Arquivo a alterar

- `src/utils/escala.functions.ts`

## Resultado esperado

Depois da correção, a escala gerada deve seguir o padrão do documento enviado:

```text
Plantão normal:
Dia D:     234
Dia D + 1: 1

Plantão ajustado com CM:
Dia D:     23 + CM4
Dia D + 1: CM8

Hora extra:
Dia D:     HE16
Dia D + 1: HE8
```

E, principalmente, as horas extras passarão a ser escritas na linha `HE`, permitindo que a fórmula da planilha contabilize corretamente o excesso de carga horária.