# Correção da reserva manual na composição ORD

## Diagnóstico

### O que é “exceção obrigatória”
- É a ação `obrigatorio` da estrutura de exceções interpretada a partir das observações livres do operador.
- O interpretador recebe texto escrito pelo operador e produz militar, dias e ação. No motor, esses dados entram no conjunto `obrigatorio`; antes da ORD automática, `lancaServico24` lança aquele militar nos dias pedidos.
- Local: `interpretarObservacoes` e etapa 3 de `escalar`, em `src/utils/escala.functions.ts`.
- Não é uma escolha autônoma de candidato pelo motor: sem militar identificável, a ação é ignorada. Pode escalar hoje um reservado porque passa antes dos seletores de ORD.
- Pode gerar a jornada 24h pela linha do tempo: ORD, eventual CM e HE conforme a carga disponível.
- Decisão: preservar somente por representar utilização explicitamente determinada pelo operador. O plano não a tratará como exceção automática nem usará o termo ambíguo isoladamente.

### Virada selecionada
- É a seleção explícita feita pelo operador na tela: ele marca o militar e escolhe `ORD (1+CM2)` ou `HE (HE8)`.
- A tela envia o identificador e o tipo escolhidos; o servidor os converte no lançamento do dia 1 e nos bloqueios de descanso correspondentes.
- Portanto, é decisão manual e deve ser preservada. A virada descrita explicitamente nas observações também parte de uma indicação nominal do operador, não de escolha autônoma do motor.

### Lançamentos diretos
- Nascem das observações livres e contêm dias, sigla, linha e, quando informado, militar/matrícula.
- Lançamento dirigido a militar identificado é decisão explícita e será preservado.
- Lançamento genérico sem militar aplica-se atualmente a todo o efetivo. Para a regra de reserva, ele não demonstra decisão individual de utilizar o reservado; o reservado deverá ser excluído dessa expansão automática, mantendo os demais destinatários.

## Mapa dos caminhos

| Caminho | Natureza | Atinge reservado hoje? | Decisão |
|---|---|---:|---|
| ORD, fallback, preenchimento, substituição CG/COV | Automática | Não | Manter bloqueio atual |
| CM de fechamento de carga | Automática | Não | Manter bloqueio atual |
| HE normal / HE24 / HE fracionada / tapa-furo | Automática | Sim | Bloquear |
| HE forçada por efetivo mínimo | Automática | Sim | Bloquear |
| Reconciliação ORD→HE | Automática | Pode, se houver lançamento complementar anterior | Bloquear |
| Saneamentos finais | Automática, apenas corrige/reduz lançamentos existentes | Não escolhe nem cria utilização nova | Manter; não transformar em seletor |
| Virada selecionada na tela | Manual explícita | Sim | Preservar |
| Virada nominal informada nas observações | Manual explícita interpretada | Sim | Preservar |
| Lançamento direto nominal | Manual explícito interpretado | Sim | Preservar |
| Lançamento direto genérico “para todos” | Expansão automática de comando genérico | Sim | Excluir reservado |
| Ação `obrigatorio` nominal | Manual explícita interpretada | Sim | Preservar |
| Afastamentos | Informação do operador/plano anual, não escalação | Registra sigla informativa | Preservar |

## Implementação autorizável
- Reutilizar exatamente o identificador existente de militar ativo 24h fora da composição ORD manual; não criar status, afastamento ou segunda definição.
- Excluir esse conjunto dos candidatos de HE normal, HE24, HE fracionada, tapa-furo e HE forçada.
- Excluir esse conjunto da reconciliação automática ORD→HE.
- Excluir esse conjunto somente da expansão de lançamento direto sem militar identificado; preservar lançamentos nominais, viradas nominais/selecionadas e ação `obrigatorio` nominal.
- Manter ORD e CM já protegidos, sem alterar regras dos integrantes das guarnições ou do modo sem composição manual.
- Atualizar o aviso único e consolidado para dizer que os reservados não foram utilizados automaticamente e permanecem disponíveis para lançamento manual.
- Acrescentar ao PDF de Furos apenas a observação consolidada já autorizada, usando o alerta salvo; não alterar os registros, contagens, classificação, prioridade, CG ou COV.

## Arquivos mínimos
- `src/utils/escala.functions.ts`: filtros automáticos, expansão genérica, aviso e proteção da reconciliação.
- `src/utils/__tests__/bloco14c-ord-manual.test.ts`: substituir a expectativa revogada de HE e cobrir os dez casos obrigatórios.
- `src/routes/app.importar.tsx`: incluir no PDF somente a observação informativa extraída dos alertas já carregados.
- Testes do relatório/detalhe apenas se necessários para comprovar que os furos permanecem idênticos.

## Testes e validação
- Cenário 17/16: reservado com ORD, CM e HE automáticas iguais a zero; aviso único presente.
- Integrante comum, CG e COV afastados: reservado não substitui; déficit segue ao relatório.
- HE normal, cheia, fracionada, forçada e tapa-furo: reservado nunca é candidato; demais militares mantêm critérios atuais.
- Dois reservados: nenhum recebe escalação automática; aviso e observação consolidam ambos.
- Lançamento nominal, virada selecionada/nominal e `obrigatorio` nominal: continuam utilizando o reservado quando o operador o determinou.
- Lançamento genérico: continua nos militares elegíveis, mas não expande para o reservado.
- Sem composição manual e composição manual com todos incluídos: comportamento anterior integralmente preservado.
- Relatório de Furos: mesmos furos antes/depois, apenas com a observação informativa.
- Rodar suíte específica, motor, XLSX, xlsx-surgical, suíte completa, verificação de tipos e build.
- Depois, repetir o cenário fictício 17/16 no fluxo real e conferir especialmente os dias 20/21, 24/25 e 28/29, parando na primeira regressão.

## Risco e limites
- Risco baixo e localizado nos filtros de seleção, com risco principal de confundir comando nominal com expansão genérica; os testes acima separam os dois casos.
- Não exige refatoração ampla, migration, schema ou mudança do mecanismo manual.
- Nenhuma regra de CG/COV, descanso, carga, HE dos demais, ADM, afastamentos, XLSX ou outras áreas será alterada.

**IMPLEMENTAÇÃO DESTE AJUSTE: NÃO REALIZADA**  
**REGRA DEFINITIVA: MOTOR NÃO PODE ESCALAR AUTOMATICAMENTE MILITAR FORA DA ORD MANUAL**  
**LANÇAMENTO EXPLICITAMENTE DETERMINADO PELO OPERADOR: DEVE SER PRESERVADO**  
**ORD: NÃO ALTERADA NESTA ETAPA**  
**CM: NÃO ALTERADO NESTA ETAPA**  
**HE: NÃO ALTERADA NESTA ETAPA**  
**RELATÓRIO DE FUROS: NÃO ALTERADO NESTA ETAPA**  
**XLSX: NÃO ALTERADO**  
**RLS/SCHEMA: NÃO ALTERADOS**  
**DADOS OPERACIONAIS: NÃO ALTERADOS**  
**PUBLICAÇÃO: NÃO REALIZADA**
