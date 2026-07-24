# Bloco 5 — NBI: Inteligência, Numeração, Histórico e Auditoria (revisado 4)

Todo o trabalho fica dentro do módulo NBI. Nenhum arquivo do motor de escalas,
XLSX, PDF de furos, Stripe/Nexano/Asaas, autenticação, assinaturas ou Landing
Page será tocado.

## 1. Banco de dados (uma migração NBI)

Todas as tabelas em `public`, `GRANT` para `authenticated` e `service_role`
(sem `anon`), RLS ligado, políticas por `auth.uid()`.
Toda função `SECURITY DEFINER` usa `SET search_path = public`.

### Tabelas

- `public.nbi_numeracao` — 1 linha por `user_id`. Campos:
  `ano_referencia smallint`, `ultima_nota int`, `reiniciar_anualmente bool`,
  `prefixo text null`, `observacoes text null`, `updated_at`.
  RLS: dono lê/escreve a própria linha.
- `public.nbi_numeracao_log` — histórico de mudanças de sequência.
  `user_id`, `ano`, `numero_anterior`, `numero_novo`, `motivo`, `created_at`.
  RLS: dono só SELECT. Sem INSERT/UPDATE/DELETE para `authenticated` — só
  `service_role` (funções DEFINER escrevem por baixo).
- `public.nbi_auditoria` — append-only.
  `user_id`, `documento_id`, `acao text CHECK IN
  ('criou','editou','gerou','baixou','cancelou','numeracao_alterada','erro_geracao')`,
  `detalhes jsonb`, `created_at`.
  RLS: dono só SELECT. Sem INSERT/UPDATE/DELETE para `authenticated`.
- `nbi_documents`: adiciona `numero_oficial int`, `ano_oficial smallint`,
  `prefixo_oficial text null`, `reserved_at timestamptz null`,
  `generated_at timestamptz null`, `arquivo_hash_sha256 text null`,
  `arquivo_bytes int null`, `modelo_mestre_versao text null`,
  `templates_versoes jsonb null`, `erro_geracao text null`,
  `cancelado_em timestamptz null`, `cancelado_por uuid null`,
  `cancelamento_motivo text null`.
  Índice único parcial `(user_id, ano_oficial, numero_oficial)
  WHERE numero_oficial IS NOT NULL`.

### Funções SECURITY DEFINER — EXECUTE para `authenticated`

Todas usam `auth.uid()` como fonte de identidade; ignoram qualquer `user_id`
externo.

- `nbi_reservar_numero(_documento_id uuid, _ano_local smallint,
  _confirmar_novo_ano boolean DEFAULT false)`
  **Escopo restrito à reserva.** Não preenche `generated_at`. Não grava
  auditoria `'gerou'`. Passos:
  1. `auth.uid()` obrigatório; erro se NULL.
  2. Valida `_ano_local` em `2020..2100` **e** que coincide com
     `EXTRACT(YEAR FROM nbi_documents.data_documento)` do documento —
     senão `RAISE NBI_ANO_LOCAL_INVALIDO`. O cliente não escolhe o ano
     livremente.
  3. `SELECT ... FOR UPDATE` no documento; erro se não pertence a
     `auth.uid()`.
  4. **Idempotência:** se o documento já tem `numero_oficial` e
     `ano_oficial`, devolve `{ numero, ano, prefixo }` atuais e encerra
     — sem tocar em `nbi_numeracao`, sem log, sem auditoria.
  5. `SELECT ... FOR UPDATE` na linha de `nbi_numeracao` do usuário
     (serializa cliques simultâneos).
  6. Transição de ano (`_ano_local` vs `ano_referencia`; nunca `now()`
     em UTC):
     - `_ano_local > ano_referencia` e `reiniciar_anualmente = true`:
       - `_confirmar_novo_ano = false` → `RAISE NBI_CONFIRMAR_NOVO_ANO`
         (nada é gravado).
       - `true` → grava `nbi_numeracao_log` (`numero_anterior =
         ultima_nota`, `numero_novo = 0`, motivo `reinicio_anual`),
         seta `ano_referencia = _ano_local`, `ultima_nota = 0`.
     - `_ano_local > ano_referencia` e `reiniciar_anualmente = false`:
       grava log (`numero_anterior = ultima_nota`, `numero_novo =
       ultima_nota`, motivo `continuidade_ano_{ano}`), seta
       `ano_referencia = _ano_local`. Mantém `ultima_nota`.
       Última 237/2026 → próxima 238/2027, sem confirmação.
     - `_ano_local < ano_referencia` → `RAISE NBI_ANO_LOCAL_INVALIDO`.
  7. `numero := ultima_nota + 1`; `UPDATE nbi_numeracao SET ultima_nota =
     numero`.
  8. `UPDATE nbi_documents SET numero_oficial = numero, ano_oficial =
     _ano_local, prefixo_oficial = nbi_numeracao.prefixo, reserved_at =
     now()`. **Não** seta `generated_at`. **Não** grava auditoria
     `'gerou'`.
  9. Retorna `{ numero, ano, prefixo }`.

- `nbi_alterar_sequencia(_ano int, _nova_ultima int, _motivo text)`
  Só age sobre `auth.uid()`. Motivo obrigatório. Rejeita
  `_nova_ultima < max(numero_oficial WHERE ano_oficial = _ano AND
  user_id = auth.uid() AND numero_oficial IS NOT NULL)`. Grava
  `nbi_numeracao_log` e `nbi_auditoria('numeracao_alterada')` — a própria
  função DEFINER escreve (owner tem privilégio; não depende de
  `service_role`).

- `nbi_cancelar(_documento_id uuid, _motivo text)`
  Valida propriedade; motivo obrigatório; rejeita documento sem
  `numero_oficial`. Marca `cancelado_em/por/motivo`. Número e arquivo
  permanecem. Grava `nbi_auditoria('cancelou')`.

- `nbi_descartar_rascunho(_documento_id uuid)` — só documentos sem
  `numero_oficial`. Marca status descartado (não apaga bytes). Grava
  `nbi_auditoria('editou')` com detalhe descarte.

### Sem funções internas de auditoria expostas

Não haverá `nbi_registrar_download/erro/criacao/edicao` chamadas do
cliente. Não haverá função DEFINER que dependa de `auth.uid()` sendo
chamada por `service_role` (isso quebraria, pois `service_role` não tem
`auth.uid()`).

As inserções em `nbi_auditoria` para `criou`, `editou`, `gerou`, `baixou`,
`erro_geracao` são feitas **exclusivamente pelo backend** (`supabaseAdmin`)
depois que a server function autenticou o usuário e validou a
propriedade do documento via RLS. O `user_id` é sempre o `context.userId`
da sessão — nunca vindo do frontend.

## 2. Server functions (`src/lib/nbi.functions.ts`)

Todas com `requireSupabaseAuth`. Padrão comum em cada handler:

```
1. userId = context.userId (do bearer validado)
2. doc = context.supabase.from('nbi_documents').select().eq('id', id).single()
   → RLS garante que o documento é do usuário; senão 404/forbidden.
3. lógica de negócio (RPC DEFINER, storage, docx…)
4. supabaseAdmin.from('nbi_auditoria').insert({
     user_id: userId, documento_id: id, acao, detalhes,
   })  ← só depois da validação
```

Nenhum handler aceita `user_id`, `acao` de auditoria ou `detalhes`
técnicos vindos do frontend.

- `criarRascunhoNbi({ snapshot })` — INSERT via `context.supabase`
  (RLS). Auditoria `criou` via admin.
- `atualizarRascunhoNbi({ documentoId, snapshot })` — UPDATE via
  `context.supabase`. Auditoria `editou` via admin.
- `gerarDocxNbi({ documentoId, confirmarNovoAno? })`:
  1. Valida propriedade (passo 2 acima). Se `cancelado_em != null`,
     rejeita.
  2. Deriva `anoLocal` de `data_documento` (fonte única).
  3. `context.supabase.rpc('nbi_reservar_numero', { ... })`. Se
     `NBI_CONFIRMAR_NOVO_ANO`, devolve `{ precisaConfirmarNovoAno: true,
     ano: anoLocal }` sem outros efeitos. Se `NBI_ANO_LOCAL_INVALIDO`,
     mensagem clara. Sucesso → `{ numero, ano, prefixo }` reservados.
  4. Renderiza DOCX com `docxtemplater` a partir do snapshot já
     validado. Se `docs.arquivo_hash_sha256 != null && generated_at !=
     null`, pula geração (nada a fazer).
  5. Upload em `nbi-documentos` no path
     `${userId}/${ano}/${numero}-${docId}.docx`. Calcula SHA-256 e
     tamanho.
  6. UPDATE `nbi_documents` via admin: `arquivo_path`,
     `arquivo_hash_sha256`, `arquivo_bytes`, `modelo_mestre_versao`,
     `templates_versoes`, **`generated_at = now()`**,
     **`erro_geracao = null`**.
  7. Auditoria `gerou` via admin (exatamente uma vez — só se `generated_at`
     estava NULL antes deste UPDATE).
  8. **Se qualquer passo 4-6 falhar:** mensagem **sanitizada pelo
     backend** (sem stack, sem provider data). UPDATE via admin
     `erro_geracao = <mensagem sanitizada>`. Número permanece reservado,
     `generated_at` continua NULL. Auditoria `erro_geracao` via admin.
     Próxima tentativa reaproveita o mesmo número (idempotência em
     `nbi_reservar_numero` + checagem de `generated_at`).
- `baixarDocxNbi({ documentoId })`:
  1. Valida propriedade via `context.supabase` (RLS).
  2. Verifica `arquivo_path` presente e `generated_at != null`; senão
     erro.
  3. Gera URL assinada temporária pelo admin.
  4. Insere `nbi_auditoria('baixou')` via admin com `user_id =
     context.userId`.
  5. Retorna a URL. Nunca regenera arquivo.
- `cancelarNbi`, `alterarSequenciaNbi`, `descartarRascunhoNbi` — usam
  as RPCs DEFINER correspondentes (que já gravam sua própria auditoria
  como owner). Nenhum insert manual em `nbi_auditoria` aqui.
- `duplicarNbi` — cria rascunho limpo (número/arquivo/generated_at
  nulos), reconsulta férias, nunca reserva número, nunca copia bytes.
  Auditoria `criou` via admin.

## 3. Interpretador (`src/utils/nbi-interpretador.ts`)

Puro, sem IA. Devolve `{ tipo, campos, candidatosMilitar[],
nãoReconhecido[] }`. Só sugere; nunca escolhe em ambiguidade; nunca
altera texto oficial; nunca chama gerador; nunca cruza dados entre
usuários. Viagem sem destino/data/retorno → não infere. Assunção/dispensa
sem titular/função → não infere.

## 4. Wizard `app.nbi.nova.tsx`

- Etapa 1: "Próximo número previsto: {prefixo?}{ultima_nota+1}/{ano_local}"
  (leitura pura). Data manual/hoje. Se `nbi_numeracao` vazio, bloqueia
  com CTA para Configurações NBI.
- Etapa 2: interpretador + consulta `ferias_militares`; autopreenche
  nome/posto/quadro/ID func/lotação/artigos (o/a, ao/à, do/da)/dias por
  extenso/ano/período/apresentação/responsáveis.
- Etapa 3: conferência com pendências por assunto. Botão "Gerar DOCX"
  desabilitado enquanto houver pendência.
- Ao gerar: se resposta = `precisaConfirmarNovoAno`, diálogo "Iniciar a
  numeração de {ano} em 1?"; só então rechama com `confirmarNovoAno =
  true`. Sucesso → "NBI nº X/ANO gerada" + link para Histórico. Se
  falha após reserva: mostra número reservado e "Tentar novamente" (mesmo
  número).

## 5. Configurações NBI

Nova seção **Controle de Numeração**: ano de referência, última nota,
próximo número (calculado), reiniciar anualmente, prefixo
opcional/visual, observações. Primeira configuração exige "Última Nota"
+ "Ano". Botão "Alterar sequência" com motivo obrigatório, confirmação e
bloqueio server-side de colisão.

## 6. Histórico (`src/routes/app.nbi.historico.tsx`)

Paginação e filtros no banco (nunca client-side): número, ano, status
(rascunho/reservado sem arquivo/gerado/cancelado/erro), data, tipo,
nome/matrícula. Ações: Visualizar, Baixar DOCX (server fn), Duplicar,
Cancelar (só NBI com número). Cancelada = somente leitura, badge
"CANCELADA" persistente. Documentos com `reserved_at != null` e
`generated_at == null` aparecem como "Número reservado — pendente de
geração".

## 7. Menu

Itens "NBI › Nova", "NBI › Histórico", "NBI › Configurações" em
`src/routes/app.tsx`. Sem outras alterações de layout.

## 8. Fora desta entrega

Reserva manual isolada, importação de histórico, pular número,
assinatura digital, QR Code, PDF, aprovação eletrônica.

## 9. Testes manuais (Playwright headless)

1. Dois cliques simultâneos em "Gerar DOCX" → 1 único número, 1 única
   auditoria `gerou`.
2. Duas abas em documentos diferentes → números consecutivos distintos.
3. Retentativa após timeout de upload → mesmo número, `generated_at`
   preenchido só na tentativa bem-sucedida, `gerou` gravado uma vez.
4. Falha simulada de upload após reserva → `generated_at` NULL,
   `erro_geracao` gravado sanitizado, `erro_geracao` na auditoria; nova
   tentativa reutiliza o mesmo número e conclui.
5. Usuário A tenta gerar/baixar/cancelar documento de B → bloqueado por
   RLS antes de qualquer efeito.
6. Cliente tenta INSERT direto em `nbi_auditoria`/`nbi_numeracao_log`
   → negado (sem GRANT/policy).
7. Cliente tenta chamar RPC de auditoria interna → não existe.
8. Alterar sequência abaixo do maior emitido → bloqueado.
9. Cancelar NBI → número não reutilizado.
10. Trocar `nbi-mestre-v1.docx` e baixar NBI antiga → arquivo original
    inalterado (sem regeneração).
11. Novo ano com `reiniciar_anualmente = true`: 1º clique pede
    confirmação; confirmar → 1/novo ano; sem confirmar → nada gravado.
12. Novo ano com `reiniciar_anualmente = false`: 237/2026 → 238/2027
    automaticamente; `ano_oficial = 2027`.
13. `_ano_local` divergente de `data_documento` →
    `NBI_ANO_LOCAL_INVALIDO`.
14. Duplicação → rascunho sem número/arquivo/generated_at.
15. RLS cruzada entre 2 contas em todas as tabelas NBI.
16. `git diff` confirma zero mudanças no motor de escalas, XLSX,
    auditoria de escalas, rotas de escalas/importar/férias, webhooks
    Stripe/Nexano/Asaas, Landing e auth.

## 10. Relatório final

Arquivos criados/alterados, novas tabelas/funções, novas rotas, resultado
dos 16 testes, confirmação de isolamento e da separação
reserva ↔ geração efetiva.
