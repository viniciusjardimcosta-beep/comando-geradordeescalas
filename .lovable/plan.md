# Bloco 12 — Motor de Consistência Institucional e Pendências NBI (Etapa A)

Auditoria concluída sobre a base real. Nenhum código alterado.

## 1. Fontes de dados disponíveis

| Fato | Origem | Observações |
| --- | --- | --- |
| Férias | `ferias_militares` (42 registros): militar, ano, período, início, fim | Fonte primária confiável de afastamento |
| Afastamentos não-férias (luto, núpcias, licença-paternidade) | Apenas dentro de `nbi_documents.assuntos[].campos` (DATA_INICIO / DATA_FIM / QTD_DIAS) | Não existe tabela própria; só existem se houver NBI emitida |
| Apresentações | `nbi_documents.assuntos[]` com `tipo = apresentacao`, `subtipo`, campos `DATA_APRESENTACAO` | 13 itens hoje |
| Substituições / Assunção ⇄ Dispensa | `nbi_substituicoes` (status aberta/encerrada, data_inicio, data_fim_prevista, data_fim_efetiva, função, titular, substituto, documentos vinculados) | Estrutura completa; 5 registros, alguns encerrados sem previsão |
| Documentos NBI | `nbi_documents` (status rascunho/reservado/gerado, `canceled_at`, `numero`, `ano`, `data_documento`, `assuntos` jsonb) | 32 docs, 0 cancelados até agora |
| Snapshot por assunto | Cada item traz `tipo`, `codigo_motor`, `subtipo`, `militar_id`, `ferias_id`, `substituicao_id`, `campos`, `texto_final`, `versao_motor` | Base suficiente para vínculos e duplicidade |
| Militares | `militares` (ativo, dados institucionais NBI) | Inativos devem sair das pendências |
| Auditoria | `nbi_auditoria` (documento_id, ação, detalhe jsonb) | Reaproveitada na Fase 14 |
| Folgas compensatórias | `assuntos[].campos` (mes_referencia_sel, QTD_HORAS, SUBTIPO) | Sem tabela; comparação previsão × realizada é textual |

Distribuição atual de assuntos: férias 33, assunção 13, apresentação 13, viagem 12, dispensa 10, licença-paternidade 7, serviço extraordinário 5, dispensa por recompensa 5, comissão 4.

## 2. Regras implementáveis com os dados atuais

Cronológicas (puras, sem consulta): DATA_FIM ≥ DATA_INICIO; apresentação > último dia do afastamento; retorno de viagem ≥ saída; período de serviço extraordinário início ≤ fim; data da nota muito posterior ao fato (alerta); data em outro ano (alerta, já existe).

Com consulta em lote: dispensa anterior à assunção vinculada; substituição encerrada reutilizada; conflito com férias (intervalo × intervalo); conflito com afastamento registrado em NBI ativa; apresentação sem afastamento de origem; duplicidade de fato ativo; documento cancelado como origem; apresentações pendentes; assunções/dispensas pendentes; folgas previstas do mês e do próximo.

## 3. Regras SEM dados suficientes (não serão inventadas)

- "Titular já retornou" só é detectável quando o retorno do titular é uma férias na tabela ou uma apresentação emitida — caso contrário a pendência não é exibida.
- Folga compensatória "atrasada": não há data-limite oficial; só exibiremos previsão do mês corrente/seguinte e realizadas.
- Luto, núpcias e licença-paternidade só existem como afastamento se houver NBI gerada; afastamentos não documentados são invisíveis (declarado na origem do evento).
- Unidade como filtro depende de `lotacao_nbi` preenchido; será opcional.

## 4. Matriz de compatibilidade proposta

| Assunto \ Afastamento vigente | Férias | Lic.-paternidade | Luto | Núpcias |
| --- | --- | --- | --- | --- |
| Serviço extraordinário | BLOQUEIO | BLOQUEIO | ALERTA | ALERTA |
| Serviço extraordinário (convocação) | BLOQUEIO | BLOQUEIO | ALERTA | ALERTA |
| Viagem | ALERTA | ALERTA | ALERTA | ALERTA |
| Assunção de função (substituto afastado no início) | ALERTA | ALERTA | ALERTA | ALERTA |
| Apresentação | validada contra o afastamento de origem (BLOQUEIO se anterior ao fim) | idem | idem | idem |
| Folga compensatória / recompensa / comissão | SUGESTÃO informativa | idem | idem | idem |

Luto e núpcias ficam como alerta porque a base não guarda a hora do fato e o período pode ser ajustado administrativamente. A matriz fica num único arquivo configurável.

## 5. Arquitetura

```text
src/lib/nbi/consistencia/
  tipos.ts        contratos: Severidade, Achado, ResultadoConsistencia, EventoTimeline
  matriz.ts       matriz de compatibilidade afastamento × assunto
  regras.ts       regras puras (cronologia, conflito, redundância)
  timeline.ts     montagem e ordenação da linha do tempo
  pendencias.ts   apresentações/assunções/dispensas/folgas pendentes
  avaliar.ts      avaliarConsistenciaNbi(entrada) -> resultado (puro)
  index.ts        reexports
src/lib/nbi/consistencia.functions.ts   carregamento em lote (server fn autenticada)
src/components/nbi/LinhaDoTempoMilitar.tsx
src/components/nbi/ConsistenciaAssunto.tsx  (Etapa 2 do wizard)
src/routes/app.nbi.pendencias.tsx           (/app/nbi/pendencias)
src/lib/nbi/__tests__/bloco12.test.ts
```

Contrato: `avaliarConsistenciaNbi({ userId, militarId, tipoAssunto, campos, dataDocumento, documentoId?, base })` → `{ bloqueios, alertas, sugestoes, documentosRelacionados, linhaDoTempo }`. A função é pura: recebe a `base` já carregada (férias, documentos, substituições, militares) e nunca escreve no banco, não reserva número nem gera documento.

## 6. Consultas necessárias (em lote, uma vez por tela)

1. `ferias_militares` do usuário — todas do ano corrente ±1.
2. `nbi_documents` do usuário: `id, numero, ano, data_documento, status, canceled_at, assuntos` (assuntos expandidos em memória).
3. `nbi_substituicoes` do usuário com militares vinculados.
4. `militares` do usuário (ativo/inativo, dados institucionais).

O wizard reaproveita a mesma base já carregada, memoizada por `[militarId, tipo, campos relevantes]` — sem consulta por card ou por assunto, e sem loop de renderização.

## 7. Índices

Não serão criados nesta etapa. Volumes atuais (dezenas de linhas por usuário) e filtros por `user_id` já cobertos pelas policies/PKs não justificam migração. Se o teste de volume (500+ documentos) mostrar degradação, propomos então um índice em `nbi_documents(user_id, data_documento)` e `nbi_substituicoes(user_id, status)`.

## 8. Riscos de falso positivo e mitigação

- Afastamentos só conhecidos via NBI → conflito só é avaliado quando há documento ativo; a origem do dado aparece no achado.
- Substituições legadas sem `data_fim_prevista` → tratadas como "aberta sem previsão", nunca como atrasada.
- Duas assunções abertas legítimas para funções diferentes → alerta, nunca bloqueio (regra já homologada no 10C).
- Documento cancelado nunca satisfaz pendência, mas é exibido como informação, não como duplicidade ativa.
- Duplicidade reutiliza o detector de assinatura por motor já homologado (`duplicidade.ts`), sem novo critério paralelo.

## 9. Integração e limites

- Etapa 2 do wizard: bloco "Consistência institucional" abaixo do assunto preenchido.
- Etapa 3: o `PainelAuditoria` existente recebe um grupo adicional `consistencia` — nenhum painel concorrente.
- Fase 14: gravação em `nbi_auditoria` apenas para conflito confirmado, alerta ignorado, duplicação intencional e sugestão convertida em rascunho.
- Nada fora do módulo NBI é tocado: escalas, 24x72, XLSX, PDF de furos, pagamentos, autenticação, landing page, numeração, modelo mestre v4 e textos oficiais permanecem intactos.

## 10. Testes previstos

Os 28 casos do Bloco 12 em `bloco12.test.ts` (cronologia, matriz de conflitos, pendências, duplicidade, timeline, filtros do painel), mais typecheck, build de produção, verificação da rota no preview e teste de volume simulando centenas de documentos.
