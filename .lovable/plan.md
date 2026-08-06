# Bloco 12C — Etapa A: Plano de homologação e congelamento do módulo NBI

Nenhum código ou dado foi alterado. Abaixo, o inventário real e o plano de execução.

## 1. Inventário inicial (base atual)

| Item | Valor |
| --- | --- |
| Documentos NBI | 32 (31 gerados, 1 rascunho, 0 cancelados) |
| Substituições | 6 (2 abertas, 4 encerradas) |
| Férias em `ferias_militares` | 42 |
| Militares | 65 ativos, 0 inativos |
| Configurações NBI | 1 conjunto (cabeçalho, digitador, comandante, autoridade) |
| Usuários | 5 |
| Modelos homologados | 15 |
| Modelos aguardando exemplar | 9 |
| Modelo mestre | `_sistema/nbi-mestre-v4.docx` |
| Suíte NBI atual | 114 testes em 10 arquivos |

Modelos homologados: férias, apresentação (padrão, luto, núpcias), luto, núpcias, licença-paternidade, viagem, assunção de função, dispensa de função, dispensa por recompensa, nomeação de comissão (padrão), serviço extraordinário (executado), folga compensatória (previsão e realizada).

Modelos ainda bloqueados (`aguardando_exemplar`, não serão liberados): apresentação-paternidade, assunção/dispensa de cargo vago, comunicado, dispensa por recompensa sem apresentação, nomeação de comissão com funções especiais, renovação de tempo, serviço extraordinário por convocação, situação sanitária.

Pendências detectadas hoje pelo motor: 2 substituições abertas (uma sem previsão de término), apresentações e folgas serão recontadas no início da Etapa B com a base carregada.

## 2. Estratégia de isolamento dos dados de teste

- Todos os registros de homologação serão criados sob um **usuário de homologação dedicado** (conta separada), nunca sob o usuário operacional. Assim as policies por `user_id` já isolam tudo.
- Militares de teste receberão prefixo `[HOMOLOG]` no nome e matrícula da faixa `999xxx`.
- Nenhum documento, férias, substituição ou numeração do usuário operacional será lido para escrita, alterado ou cancelado.
- A numeração de teste corre na linha `nbi_numeracao` do usuário de homologação — não afeta a sequência oficial.
- Ao final: relatório com a lista de IDs criados e a opção de manter (marcados como homologação) ou remover em lote.

## 3. Registros que serão criados (massa funcional)

- 6 militares de teste (2 com dados institucionais completos, 1 sem lotação, 1 sem função documental, 1 inativo, 1 com sigla/topônimo atípicos).
- 4 períodos de férias, 3 afastamentos (luto, núpcias, licença-paternidade), 2 viagens, 2 assunções + 2 dispensas, 2 serviços extraordinários, 4 folgas compensatórias (previsão e realizada), 1 dispensa por recompensa, 1 nomeação de comissão.
- 1 NBI longa com no mínimo 22 itens (Fase 8) e 1 NBI por motor homologado (Fase 9).
- Massa de volume (Fase 13) **simulada em memória**, não gravada no banco: 200 militares, 1.000 documentos, 500 férias, 200 substituições, 5 anos, alimentando diretamente o motor puro e a timeline.

## 4. Roteiro automatizado (testes)

Novo arquivo `src/lib/nbi/__tests__/bloco12c.test.ts` (somente testes, sem mudança de motor):

1. Cronologia: fim < início; retorno de viagem < saída; apresentação anterior ao término; dispensa anterior à assunção.
2. Matriz de conflitos: serviço extraordinário × férias/licença (bloqueio), × luto/núpcias (alerta); viagem × férias/licença (alerta); assunção com substituto afastado (alerta).
3. Origem inválida: documento cancelado como origem; substituição encerrada reutilizada; militar inativo; nota em outro ano.
4. Pendências: aparecem só após o término; rascunho/reservado/cancelado não satisfazem; geradas desaparecem.
5. Redundância: duplicidade exata × assunto semelhante com datas diferentes; cancelado apenas informativo.
6. Folga compensatória: 4h, 33h, 128h; jun→jul, jul→ago, dez/2026→jan/2027; previsão × realizada sem duplicar.
7. Timeline: ordenação, paginação, recorte por período, dedupe `ferias_militares` ⇄ NBI, vínculos férias⇄apresentação e assunção⇄dispensa.
8. Volume: 1.000 documentos → avaliação e timeline dentro do orçamento de tempo.
9. Regressão de placeholders por motor homologado (schema completo, sem `undefined`/`null`).

Comandos: `bunx vitest run src/lib/nbi`, `tsgo` (typecheck) e build de produção.

## 5. Roteiro manual/E2E (Playwright + inspeção documental)

- Fases 2 a 7 executadas na interface real, com captura de tela por etapa e verificação de que "Gerar apresentação" abre rascunho **sem reservar número**.
- Fase 8: gerar a NBI longa com `nbi-mestre-v4.docx`, converter para PDF e PNG de todas as páginas, e conferir os 18 pontos exigidos (títulos únicos, agrupamento, sem título órfão, assinaturas unidas, caixa Publique-se, cabeçalho, datas, topônimos, siglas, sem placeholder/undefined/null, paginação).
- Fase 10 e 11: timeline e painel de pendências com militar ativo e inativo, todos os filtros.
- Fase 12: conferir em `nbi_auditoria` o registro de alerta ignorado, conflito confirmado, duplicidade intencional, sugestão convertida em rascunho, encerramento de substituição e cancelamento — com `user_id`, documento e detalhe mínimo.
- Fase 14: banco vazio e dados incompletos — checar mensagens orientativas, sem erro técnico exposto e sem gerar documento inválido.
- Fase 15: roteiro impresso de 8 tarefas para operador externo, com planilha de tempo/dúvidas/erros. Resultados apenas consolidados, sem alteração de código nesta etapa.

## 6. Métricas de desempenho (Fase 13)

| Métrica | Alvo |
| --- | --- |
| Consultas ao abrir painel de pendências | 4 (lote único), 0 por card |
| Consultas por assunto no wizard | 0 |
| Avaliação de consistência (1.000 docs) | < 150 ms |
| Montagem da timeline paginada | < 100 ms |
| Renderização do painel | < 1,5 s até interativo |
| Re-renders do wizard ao digitar | sem loop; recálculo só na mudança de campo relevante |

Índices só serão propostos (não aplicados) se houver degradação comprovada.

## 7. Critérios de aprovação por cenário

- A (férias): pendência nasce e morre na data certa, vínculo férias⇄apresentação íntegro, timeline sem duplicidade.
- B (luto/núpcias/paternidade): variante textual correta, grau de parentesco controlado, 8 dias padrão em núpcias.
- C (assunção⇄dispensa): duas abertas independentes, encerramento correto, encerrada reutilizada bloqueada, aberta sem previsão nunca "atrasada", ambiguidade legada bloqueia.
- D (folga): mês seguinte e virada de ano corretos, previsão e realizada distintas, nada marcado como atrasado.
- E (conflitos): severidade exatamente conforme a matriz; nenhum bloqueio por inferência.
- F (redundância): duplicidade exata detectada, semelhante legítima liberada, "duplicar mesmo assim" exige confirmação e gera auditoria.
- G (NBI longa): aprovação visual dos 18 pontos em DOCX e PDF.
- Regressão: cada motor homologado confere frase a frase com o template oficial.

## 8. Riscos

- Diferença de renderização DOCX→PDF no conversor do sandbox pode gerar falso negativo visual; a conferência final considera o DOCX como fonte de verdade.
- A massa de volume simulada não exercita latência real de rede; a medição de consultas será feita separadamente contando as chamadas do lote.
- Afastamentos que só existem via NBI continuam invisíveis quando não documentados — limitação declarada, não bug.
- Fase 15 depende de operador externo; se indisponível, será entregue apenas o roteiro e a recomendação ficará "congelar com ressalva na aceitação de operador".
- Criação de militares/documentos de teste aumenta o volume histórico do usuário de homologação; limpeza opcional ao final.

## 9. Entrega da Etapa B

Relatório com inventário antes/depois, cenários aprovados/reprovados, bugs encontrados e corrigidos, arquivos alterados, documentos gerados (DOCX/PDF/PNG), desempenho, suíte, typecheck, build, lista de assuntos ainda bloqueados com justificativa, confirmação de que nada fora do NBI foi tocado e a recomendação final (CONGELAR / CONGELAR COM RESSALVAS / NÃO CONGELAR).
