Peço desculpas — você tem razão em reclamar. Eu mexi no ponto do lançamento, mas deixei passar a causa que faz o sistema achar que ainda existe mais carga ordinária do que realmente existe.

O problema que encontrei agora é este:

```text
ANTONIO TOLFO FLORES tem férias de 20 a 28 em maio/2026 = 9 dias afastado.
Carga base de maio/2026 = 177h.
177 * (1 - 9/31) = 125,6129h.

O sistema usa Math.round(...) => 126h.
Mas a planilha/carga mensal esperada trabalha com 125h.
```

Por isso, no dia 18 o sistema calcula saldo ordinário como 6h e lança turno ordinário (`2`), quando o saldo correto é 5h. A regra que eu coloquei (`saldo < 6 => CM + HE`) não dispara porque o sistema está calculando o saldo errado como exatamente 6.

Plano de correção pontual:

1. Em `src/utils/escala.functions.ts`, criar uma única função para calcular a carga mensal proporcional usando arredondamento para baixo (`Math.floor`) em vez de arredondamento comum (`Math.round`).

2. Trocar somente os três pontos que calculam a carga mensal proporcional:
   - teto ordinário usado durante o lançamento da jornada;
   - carga mínima do acerto final;
   - carga alvo de militares ADM.

3. Manter intacta a regra já implementada do fluxo lógico:
   ```text
   enquanto saldo ordinário >= 6h: pode lançar turno ordinário;
   quando saldo ordinário > 0 e < 6h: lança CM com o saldo exato;
   o restante do serviço vira HE.
   ```

Resultado esperado para o caso citado:

```text
Antes do dia 18: saldo ordinário correto = 5h
Dia 18 linha ORD: vazio, não lança "2"
Dia 18 linha EXP/COM: CM5
Dia 18 linha HE: HE11
Dia 19 linha HE: HE8, se for continuação da madrugada do serviço
Carga ordinária mensal fecha no limite e não passa para vermelho.
```

Não vou mexer em rotação, grupos, IA, tela, banco nem no restante do preenchimento — apenas nesse cálculo da carga mensal que está causando o erro.