Vou corrigir o motor para tratar esse caso como regra estrutural da escala, não como interpretação da IA.

## Problema confirmado

Na escala gerada, quando o sistema transforma um plantão de 24h para algo como:

```text
Dia 28: ORD 23 + CM4
```

ele limita corretamente o dia 28 a 16h, mas não cria a continuação no dia 29:

```text
Dia 29: CM8
```

Com isso, o militar deixa de cobrir a madrugada de 00h às 08h, e o dia 29 fica com menos militares do que o mínimo exigido. Além disso, a última escala segue sem HE porque o lançamento de excedente mensal está amarrado de forma incorreta à contagem de carga e aos plantões reais.

## O que vou ajustar

### 1) Criar uma regra de “serviço físico 24h dividido”
Quando o sistema precisar converter parte de um plantão ordinário em CM para fechar carga horária, ele deve preservar a cobertura física de 24h do serviço.

Exemplo correto:

```text
Dia 28: ORD 23 + CM4  = 16h de 08h a 00h
Dia 29: EXP/CM8       = 8h de 00h a 08h
```

Ou seja: se o plantão original era 24h, mas no dia de entrada só coube `CM4`, o restante da madrugada precisa ser lançado no dia seguinte como `CM8`, desde que exista dia seguinte dentro da planilha.

### 2) Separar “limite físico do dia de entrada” de “cobertura da madrugada”
A regra anterior tratou o limite de 16h como se o serviço acabasse ali. Vou ajustar para o motor entender:

- dia de entrada comporta no máximo 16h úteis até meia-noite;
- a madrugada de 00h às 08h pertence visualmente ao dia seguinte;
- se o militar estava cobrindo serviço 24h, essa madrugada precisa aparecer no dia seguinte (`1` ou `CM8`/`HE8`, conforme o tipo do lançamento);
- não pode simplesmente cortar as 8h finais, pois isso reduz a guarnição mínima.

### 3) Corrigir o acerto de carga mensal com CM
A parte que hoje transforma o último `234 + 1` em `23 + CM4` será alterada para trabalhar por blocos:

- manter parte ordinária no dia de entrada (`234`, `23` ou `2` conforme o necessário);
- lançar CM no dia de entrada somente até completar 16h no mesmo dia;
- lançar o restante obrigatório da madrugada no dia seguinte como CM, quando o plantão original exigia cobertura de 24h;
- atualizar corretamente a carga computada para não achar que ainda faltam horas nem remover cobertura.

Exemplo para 12h faltantes:

```text
Antes: 234 + 1
Depois: dia D = 23 + CM4; dia D+1 = CM8
Total físico preservado: 24h
```

### 4) Fazer a HE voltar a aparecer corretamente
Vou revisar a etapa de excedente mensal para garantir que:

- o excedente acima da carga mínima seja lançado como `HE`;
- HE de serviço 24h seja quebrada como `HE16` no dia de entrada + `HE8` no dia seguinte;
- HE não seja lançada em dia livre aleatório;
- limites por posto, como “sargentos no máximo 24h e equalizado”, continuem valendo;
- se o teto impedir o lançamento, o sistema gere alerta claro informando que a HE foi bloqueada por limite definido.

### 5) Recontar guarnição mínima considerando a madrugada do dia seguinte
A validação final será fortalecida para detectar o caso que você apontou:

```text
Dia 28: 2 militares 234+1
Dia 28: 2 militares 23+CM4 sem CM8 no dia 29
```

O sistema deve entender que, na madrugada do dia 29, esses dois últimos militares também precisam estar cobertos. Se não estiverem, deve completar com `CM8`/`HE8` conforme o caso, ou alertar caso não haja possibilidade.

### 6) Ajustar a sanidade final para não apagar complemento necessário
A validação final atual só corta excesso acima de 24h, mas não garante que a continuação de madrugada exista. Vou adicionar uma validação inversa:

- se um serviço foi reduzido para `23 + CM4`, exigir continuação `CM8` no dia seguinte;
- se uma HE foi `HE16`, exigir `HE8` no dia seguinte quando for serviço 24h;
- se estiver no último dia do mês, não inventar dia seguinte dentro da planilha atual; esse caso pertence à virada do mês seguinte.

## Arquivo afetado

- `src/utils/escala.functions.ts`

## Resultado esperado

Depois da correção, o caso do Sd Willian Kramer da Silva no dia 28 deve ficar no padrão correto:

```text
Dia 28: 23 + CM4
Dia 29: CM8
```

E a escala não deve mais deixar a madrugada do dia seguinte abaixo do mínimo de 4 militares quando o serviço original era de 24h. Também vou corrigir a lógica para a previsão de HE aparecer novamente quando houver excedente mensal real.