Você está certo: conferindo a última escala gerada, o AUGUSTO já fechou exatamente as 120h de carga ordinária antes daquele lançamento.

Na linha dele aparecem 5 plantões ordinários completos:

```text
Dia 03: 234 + dia 04: 1 = 24h
Dia 06: 234 + dia 07: 1 = 24h
Dia 10: 234 + dia 11: 1 = 24h
Dia 13: 234 + dia 14: 1 = 24h
Dia 25: 234 + dia 26: 1 = 24h
Total ordinário = 120h
```

Como ele teve férias de 15 a 24 em maio, a carga mensal dele é 120h. Então, depois disso, não tinha mais nada a completar com CM. O serviço/cobertura posterior deveria ser todo HE.

Plano de correção pontual:

1. Ajustar somente a função de cálculo da carga mensal proporcional em `src/utils/escala.functions.ts`.

2. O cálculo atual usa proporção pela carga base fracionada do mês:

```text
177 * (1 - 10/31) = 119,90...
Math.floor(...) = 119
```

Isso faz o motor achar que existe diferença residual/ajuste e abre espaço para CM indevido.

3. Trocar esse cálculo para contar os dias úteis de escala como blocos de 24h proporcionalmente aos dias disponíveis, arredondando para múltiplo de turno de 6h, para refletir a lógica operacional:

```text
31 dias - 10 férias = 21 dias disponíveis
177 * 21 / 31 = 119,90...
arredonda para múltiplo de 6h mais próximo = 120h
```

4. Aplicar essa mesma função nos três pontos que usam carga mensal proporcional:
   - teto ordinário usado durante o lançamento;
   - carga alvo de ADM;
   - acerto final de carga mensal.

5. Manter a regra de preenchimento exatamente como você explicou:

```text
Enquanto ainda cabe turno ordinário de 6h, lança ordinário.
Se faltar menos de 6h para completar a carga, lança esse resto como CM e completa o serviço como HE.
Se a carga mensal já está fechada, não lança CM; lança tudo como HE.
```

Resultado esperado para o Augusto:

```text
Carga mensal: 120h
Turnos ordinários lançados: 5 x 24h = 120h
CM: nenhum
Tudo depois disso: HE
```

Não vou mexer em tela, banco, aprovação, IA, rotação geral ou outros cadastros — somente nesse cálculo de carga proporcional que está causando o CM indevido.