# Núcleo Crítico do NBI — Matriz de Risco de Alteração
### Bloco 12F — proteção contra regressão

Escala: **BAIXO** · **MÉDIO** · **ALTO** · **CRÍTICO**.
Arquivos CRÍTICO e ALTO não devem ser alterados sem plano aprovado, teste específico e nova geração em homologação.

| Arquivo | Responsabilidade | Risco | Testes que o protegem |
|---|---|---|---|
| `_sistema/nbi-mestre-v4.docx` (storage) | Modelo mestre do documento oficial: fonte, margens, cabeçalho, assinaturas | **CRÍTICO** | Geração em homologação (TESTE 003/004/005) — sem cobertura automatizada; exige conferência visual |
| `src/lib/nbi.functions.ts` | Server function de geração: validação estrutural, reserva de número, render DOCX, gravação no storage | **CRÍTICO** | `bloco12e.test.ts`, `bloco10c.test.ts`, geração em homologação |
| RPC `nbi_reservar_numero` + trigger `nbi_guard_numeracao_update` | Numeração oficial, unicidade e prefixo de ambiente | **CRÍTICO** | `bloco12e.test.ts` (falha não consome número) + auditoria de `nbi_numeracao_log` |
| `src/lib/nbi/geracaoFluxo.ts` | Ordem persistir → validar → reservar → gerar; trava de duplo clique | **CRÍTICO** | `bloco12e.test.ts` (8 casos) |
| `src/routes/app.nbi.nova.tsx` (persistência pré-geração) | Grava o estado do wizard antes de gerar; impede downgrade de documento numerado | **CRÍTICO** | `bloco12e.test.ts`, `etapa3Estabilidade.test.ts`, validação operacional 12E |
| `src/lib/nbi/motores/*.ts` (12 motores homologados) | Resolução de campos, validação e placeholders por assunto | **CRÍTICO** | `bloco10e.test.ts`, `bloco11a.test.ts`, `bloco11b.test.ts`, `bloco12c.test.ts` |
| `src/lib/nbi/motores/registry.ts` | Fonte única de resolução de motor por código | **ALTO** | `bloco12c.test.ts`, `assuntoPicker.test.tsx` |
| `src/lib/nbi/homologacao.ts` | Define o que pode gerar oficialmente e reservar número | **ALTO** | `bloco10e.test.ts` |
| Tabela `nbi_templates` (textos oficiais) | Redação oficial de cada assunto | **ALTO** | Conferência documental + `bloco12c.test.ts` (placeholders) |
| `src/lib/nbi/consistencia/*` | Bloqueios, alertas, sugestões, pendências e timeline | **ALTO** | `bloco12.test.ts` (19), `bloco12c.test.ts` (71) |
| `src/lib/nbi/auditoria.ts` + `PainelAuditoria.tsx` | Auditoria pré-geração; bloqueio da geração | **ALTO** | `bloco10d.test.ts` |
| `src/lib/nbi/duplicidade.ts` | Impede itens/documentos repetidos | **ALTO** | `bloco10c.test.ts` |
| `src/lib/nbi/cabecalho.ts` | Normalização do cabeçalho institucional | **ALTO** | `bloco10c.test.ts`, `bloco10d.test.ts` |
| `src/lib/nbi/campos.ts`, `derivados.ts`, `dataDispensa.ts` | Campos derivados e datas automáticas | **MÉDIO** | `bloco10c.test.ts`, `bloco10d.test.ts` |
| `src/lib/nbi/comissao.ts`, `luto.ts`, `folgaCompensatoria.ts`, `motivos.ts` | Catálogos controlados de apoio aos motores | **MÉDIO** | `bloco10e.test.ts`, `bloco11a.test.ts`, `bloco11b.test.ts` |
| `src/lib/nbi/siglas.ts`, `fundamentos.ts`, `src/utils/nbi-institucional.ts` | Siglas canônicas e fundamento legal | **MÉDIO** | `bloco10d.test.ts`, `bloco10e.test.ts` |
| `src/utils/nbi.ts` | Utilitários de formatação, interpolação e análise de frase | **MÉDIO** | `bloco10c.test.ts`, `bloco12c.test.ts` |
| `src/lib/nbi/interpretacao.ts` | Interpretação por frase (preenchimento assistido) | **MÉDIO** | `bloco12c.test.ts` |
| `src/components/nbi/AssuntoPicker.tsx` | Seleção de assunto e separação disponível/bloqueado | **MÉDIO** | `assuntoPicker.test.tsx` (7) |
| `src/utils/nbi-corretor.ts`, `nbi-dicionario.ts`, `nbi-lexico.ts`, `nbi-toponimos.ts`, `src/workers/lexico.worker.ts`, `src/hooks/use-spellcheck.ts` | Revisão ortográfica assistida (não altera texto oficial sozinha) | **BAIXO** | `revisaoOrtografica.test.ts`, `etapa3Estabilidade.test.ts` |
| `src/routes/app.nbi.historico.tsx`, `app.nbi.pendencias.tsx`, `app.nbi.configuracoes.tsx` | Consulta e configuração — sem efeito sobre documento já gerado | **BAIXO** | `bloco12.test.ts` (lógica subjacente) |

## Componentes obrigatoriamente tratados como críticos

Modelo mestre · numeração · geração DOCX · motores oficiais · persistência pré-geração.

## Cobertura

12 arquivos de teste · **193 casos** · 100% verdes no congelamento.
Lacuna conhecida: fidelidade visual do DOCX não tem teste automatizado — depende de geração e conferência no ambiente de homologação.
