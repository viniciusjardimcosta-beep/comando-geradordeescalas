Vou corrigir o motor com uma regra mais fiel ao preenchimento das escalas de exemplo, sem depender só da IA interpretar texto livre.

## O que vou ajustar

### 1) Corrigir o caso do Sd Willian: limite físico no mesmo dia
Hoje o motor consegue deixar algo como:

```text
ORD: 23  = 12h
EXP: CM9 = 9h
Total no mesmo dia = 21h
```

Isso está errado porque, para lançamento no mesmo dia de entrada, o limite operacional útil é 16h. Nesse exemplo, o correto é:

```text
Dia 28: ORD 23 + CM4 = 16h
Dia 29: CM5 ou outra complementação restante, se ainda precisar fechar carga
```

Vou criar uma função central para calcular o espaço real disponível no dia antes de lançar CM/EXP/HE complementar:

- se já tem `23` no dia, só cabe mais `CM4` naquele dia;
- se já tem `2`, cabe até `CM10`;
- se já tem `234`, não cabe CM no mesmo dia;
- se o restante não couber, o motor passa automaticamente para o próximo dia livre;
- no último dia do mês, não empurra horas para fora da planilha atual sem regra explícita.

Também vou adicionar uma validação final: se alguma célula/bloco ficar com combinação impossível como `23 + CM9`, o motor corrige antes de gravar ou emite alerta detalhado.

### 2) Restaurar HE de excedente mensal, mas sem criar “HE fantasma”
A alteração anterior removeu a HE do excedente para evitar lançamentos absurdos no dia 01. Isso resolveu uma coisa, mas quebrou outra: a planilha precisa receber `HE` quando o militar ultrapassa a carga horária mensal prevista, para a fórmula identificar a previsão de HE.

Vou refazer essa parte assim:

- calcular a carga mensal prevista do militar;
- calcular o excedente real;
- lançar esse excedente na linha `HE`, mas vinculado a dias em que o militar realmente trabalhou/teve plantão, não em dias livres aleatórios como dia 01;
- respeitar a quebra temporal correta:
  - até `HE16` no dia de entrada do serviço;
  - até `HE8` na madrugada do dia seguinte, quando aplicável;
  - se precisar quebrar em `HE3`, `HE4`, etc., pode quebrar, mas só quando necessário;
- não lançar HE em dia de folga pré/pós-plantão só para “fechar matemática”.

Ou seja: a HE volta a aparecer na planilha, mas como classificação do excedente real, não como escala extra inventada.

### 3) Fortalecer limite e equalização de HE dos sargentos
Para uma diretriz como:

```text
limitar as HE dos sargentos em no máximo 24h, equalizado entre todos
```

O motor vai entender de forma determinística:

- aplicar o teto por sargento: ninguém passa de 24h, salvo se não houver alternativa e isso for reportado como alerta;
- distribuir primeiro para quem tem menos HE acumulada;
- tentar aproximar todos os sargentos do mesmo total antes de repetir alguém;
- quando o teto impedir fechar a guarnição mínima, gerar alerta claro dizendo que faltou efetivo dentro do limite definido.

### 4) Equalizar HE dos soldados sem fragmentar demais
Para soldados, vou separar a lógica:

- priorizar soldados com menor total de HE no mês;
- preferir blocos maiores e operacionais, como `HE16 + HE8` quando for serviço 24h de HE;
- só usar quebras pequenas (`HE3`, `HE4`, `HE5`, etc.) para ajuste fino, quando for realmente necessário para fechar carga/limite;
- evitar concentrar HE sempre nos mesmos soldados.

### 5) Melhorar o prompt da IA e, principalmente, as travas do motor
A IA continuará interpretando as observações, mas as regras críticas não ficarão “na cabeça da IA”. O motor vai impor:

- teto de HE por posto/pessoa;
- equalização por grupo;
- limite físico por dia;
- quebra correta entre dia atual e dia posterior;
- regra de excedente mensal lançado como HE;
- bloqueios de folga pré/pós-plantão.

Assim, mesmo se a IA interpretar de forma imperfeita, o preenchimento final não deve gerar combinações impossíveis.

### 6) Conferir a planilha enviada
Depois da aprovação, vou analisar a planilha anexada e usar o caso do Sd Willian Kramer da Silva no dia 28 como caso de teste direto. A correção será validada para garantir que esse padrão não volte a acontecer.

## Arquivo principal afetado

- `src/utils/escala.functions.ts`

Não pretendo mexer nas permissões do banco nesta rodada, porque a isolação por usuário já aparece aplicada nas políticas atuais: cada usuário vê apenas seus próprios dados operacionais; o admin mantém acesso apenas à gestão de perfis/papéis.