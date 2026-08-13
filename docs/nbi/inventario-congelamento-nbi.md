# Inventário Técnico — Versão Congelada do Módulo NBI
### Bloco 12F — Congelamento formal (base funcional homologada)

**Data do congelamento:** 13/08/2026
**Escopo:** módulo NBI apenas. Gerador de escalas, férias/24x72, pagamentos e autenticação não foram tocados neste bloco.

---

## 1. Modelo mestre DOCX

| Item | Valor |
|---|---|
| Arquivo | `nbi-mestre-v4.docx` |
| Local | bucket privado `nbi-documentos`, pasta `_sistema/` |
| Referência no código | `src/lib/nbi.functions.ts` (download em `_sistema/nbi-mestre-v4.docx`) |
| Características homologadas | Arial 10pt, cabeçalho institucional apenas na 1ª página, `keepNext` nas assinaturas, agrupamento global por assunto |
| Versões anteriores | v1, v2, v3 (substituídas — mantidas apenas como histórico) |

---

## 2. Motores existentes e versões

Registry único: `src/lib/nbi/motores/registry.ts` (proibido `switch/case` por assunto fora dele).

| Motor | Código | Nível | Versão template | Fonte documental |
|---|---|---|---|---|
| Férias | `ferias` | HOMOLOGADO | 1 | NBI 19/2025; NBI 13/2026 |
| Apresentação (agregador) | `apresentacao` | HOMOLOGADO | 1 | NBI 13/2026; 19/2025; 28/2025; exemplar de Luto |
| Núpcias | `nupcias` | HOMOLOGADO | 1 | NBI 28/2025; Modelo Oficial 2022 |
| Luto | `luto` | HOMOLOGADO | 1 | Exemplar oficial de Luto; Modelo 2022 |
| Viagem | `viagem` | HOMOLOGADO | 1 | NBI 15/2026 |
| Assunção de função | `assuncao_funcao` | HOMOLOGADO | 1 | NBI 29/2025; 02/2026 |
| Dispensa de função | `dispensa_funcao` | HOMOLOGADO | 1 | NBI 29/2025; 05/2026 |
| Licença-paternidade | `licenca_paternidade` | HOMOLOGADO | 1 | NBI 15/2026; Modelo 2022 |
| Serviço extraordinário (executado) | `servico_extraordinario` | HOMOLOGADO | 1 | NBI 14/2026; 18/2026; Modelo 2022 |
| Dispensa por recompensa | `dispensa_recompensa` | HOMOLOGADO | 1 | NBI 19/2025; Modelo 2022 |
| Nomeação de comissão | `nomeacao_comissao` | HOMOLOGADO | 1 | NBI 19/2025; Modelo 2022 |
| Folga compensatória (previsão / realizada) | `folga_compensatoria` | HOMOLOGADO | 1 | NBI 14/2026; 18/2026; 21/2026; 28/2025 |
| Serviço extraordinário — convocação futura | `servico_extraordinario_convocacao` | EM_HOMOLOGAÇÃO | 1 | aguardando exemplar oficial |

**Total:** 13 motores registrados — 12 homologados, 1 em homologação (não disponível para geração oficial).

---

## 3. Categorias e templates oficiais

- Templates em `nbi_templates` (texto oficial vive somente no banco, nunca no código).
- 24 registros; **14 disponíveis** para geração oficial (`estado_homologacao = homologado`), 10 bloqueados por `aguardando_exemplar` ou marcados como subtipo indisponível.
- Controle de estado: `src/lib/nbi/homologacao.ts` — apenas `homologado` gera documento oficial e reserva número.
- Subtipos oficiais separados (Bloco 10E): serviço extraordinário (executado/convocação), nomeação de comissão (padrão/funções especiais), apresentação (férias/núpcias/luto/paternidade), folga compensatória (previsão/realizada).
- Versionamento por template: coluna `versao` + histórico em `nbi_template_versions`.

---

## 4. Regras de consistência institucional

Módulo puro em `src/lib/nbi/consistencia/`:

| Arquivo | Papel |
|---|---|
| `tipos.ts` | contratos `Achado`, `BaseConsistencia`, `EventoTimeline` |
| `matriz.ts` | matriz de severidade (bloqueio / alerta / sugestão) por par de eventos |
| `base.ts` / `carregar.ts` | montagem da base a partir de férias, NBI e substituições |
| `regras.ts` | cronologia, apresentação válida, redundância |
| `pendencias.ts` | apresentações pendentes, substituições em aberto, folgas previstas |
| `timeline.ts` | linha do tempo por militar |
| `avaliar.ts` | avaliação consolidada consumida pela UI |

Consumo na UI: `PainelAuditoria.tsx` (Etapa 3), `ConsistenciaAssunto.tsx`, `LinhaDoTempoMilitar.tsx`, rota `app.nbi.pendencias.tsx`.

---

## 5. Regras de duplicidade

- `src/lib/nbi/duplicidade.ts` — detecção de item repetido no mesmo documento e de assunto já publicado para o mesmo militar/período.
- Substituições (`nbi_substituicoes`): fechamento independente por par titular/substituto, com fallback legado por função + data de início.

---

## 6. Regras de numeração

- RPC `nbi_reservar_numero(_documento_id, _ano_local, _confirmar_novo_ano)` — `SECURITY DEFINER`, fonte única de verdade.
- Tabela `nbi_numeracao` por usuário: `ano_vigente`, `ultima_nota`, `reiniciar_anualmente`, `prefixo`.
- Auditoria em `nbi_numeracao_log`; trigger `nbi_guard_numeracao_update` impede edição livre.
- Prefixo dinâmico: ambiente de homologação usa `TESTE`; produção não usa prefixo.
- **Sequência oficial de produção: 52** — inalterada por todo o ciclo de homologação.
- Reserva ocorre **somente após** a validação estrutural (correção do Bloco 12E).

---

## 7. Estrutura de persistência

| Tabela | Conteúdo |
|---|---|
| `nbi_documents` | documento, `assuntos` (itens estruturados), `snapshot` (estado completo + rascunho), `status`, `storage_path`, numeração |
| `nbi_settings` | cabeçalho institucional, boletim, digitador/comandante/autoridade |
| `nbi_templates` / `nbi_template_versions` | redações oficiais e histórico |
| `nbi_substituicoes` | assunção/dispensa de função com fechamento por par |
| `nbi_fundamentos`, `nbi_siglas_institucionais` | catálogos institucionais |
| `nbi_numeracao`, `nbi_numeracao_log`, `nbi_auditoria` | numeração e trilha de auditoria |
| Storage | bucket privado `nbi-documentos` (modelo mestre + documentos gerados) |

Estados do documento: `rascunho` → `reservado` → `gerado` (e `cancelado`).

---

## 8. Fluxo de geração (congelado)

Orquestrado por `src/lib/nbi/geracaoFluxo.ts` e executado por `src/lib/nbi.functions.ts`:

1. **Persistir** o estado do wizard no banco (await obrigatório) — falha aborta tudo.
2. **Validar estrutura** — template, cabeçalho, seções, campos obrigatórios e responsáveis.
3. **Reservar número** — somente após a validação passar.
4. **Renderizar DOCX** a partir do modelo mestre v4.
5. **Gravar arquivo** no storage e marcar `gerado`.

Proteções: trava de reentrância (duplo clique ignorado), erro visível e persistente na Etapa 3, nenhum número consumido quando a validação falha.

---

## 9. Ambiente de homologação

- Conta `homologacao@comandogeradordeescalas.com.br` com `profiles.ambiente_homologacao = true`.
- Banner âmbar "AMBIENTE DE HOMOLOGAÇÃO" em `src/routes/app.tsx`.
- Numeração isolada com prefixo `TESTE`; 20 militares fictícios.
- Nenhum reflexo na sequência oficial de produção.

---

## 10. Baseline de testes e evidências

**Suíte automatizada:** 12 arquivos, **193/193 testes NBI verdes**. Typecheck (`tsgo --noEmit`) limpo. Build de produção aprovado.

| Documento | Conteúdo | Resultado |
|---|---|---|
| TESTE 001/2026 | primeira geração no ambiente isolado | gerado |
| TESTE 002/2026 | 22 assuntos — falha antes da correção | **reservado, sem arquivo — evidência de regressão** |
| TESTE 003/2026 | 22 assuntos, 3 páginas, 26.048 bytes, 5,4 s | geração aprovada |
| TESTE 004/2026 | regressão curta, 3 assuntos, 24.591 bytes, ~1 s | geração aprovada |
| TESTE 005/2026 | falha controlada antes da reserva + geração posterior | aprovado (sem consumo indevido de número) |

**Sequência oficial:** permanece **52**.

---

## 11. Situação dos documentos TESTE 001–005

Todos os documentos da conta de homologação foram classificados explicitamente (sem exclusão):

- título prefixado com `[HOMOLOGACAO]`;
- `snapshot.homologacao` com `ambiente = homologacao`, `valido_para_uso_oficial = false`, bloco `12F` e observação textual.

**TESTE 002** recebeu classificação própria: documento de homologação, geração incompleta, número reservado, sem arquivo, evidência de regressão do Bloco 12E, não válido para uso oficial. Deve ser preservado.

---

## 12. Regra para desenvolvimentos futuros

A partir deste congelamento, qualquer novo assunto ou alteração de redação deve:

1. preservar compatibilidade com documentos existentes;
2. **nunca** alterar silenciosamente motor já homologado — mudança real de comportamento exige incremento de versão (`nbi_templates.versao` + nova linha em `nbi_template_versions`);
3. ter teste automatizado específico;
4. passar pela suíte completa do NBI;
5. passar por typecheck;
6. passar por build de produção;
7. quando afetar o DOCX, ser gerado e conferido no ambiente de homologação antes de liberar.

**Documentos históricos nunca são reprocessados.** O `snapshot` gravado representa a regra e a redação vigentes no momento da geração; versão nova de motor vale apenas para documentos novos.
