# Banco de Férias — Consulta por Mês/Ano (auditoria + plano)

## 1. Arquitetura atual encontrada

O módulo "Plano de Férias" é uma única tela, sem camada de serviço própria: a rota faz as
consultas direto no banco e renderiza os cartões de militares com 3 períodos cada.

- Rota/menu: `/app/ferias` ("Plano de Férias" no menu lateral).
- Arquivo único: `src/routes/app.ferias.tsx`.
- Estado: `ano` (número), `filtro` (texto), `militares`, `ferias`.
- Carregamento: busca **todos** os militares ativos do usuário e **todas** as férias daquele
  `ano`, e monta um mapa `militar_id -> períodos`.
- Pesquisa atual "por militar": filtro puramente em memória, por nome ou matrícula
  (`militares.filter(...)`). Não há query de busca no banco.
- Escrita: salvar/remover período (insert/update/delete) — permanece intocada.

## 2. Tabela e campos

`ferias_militares` (RLS por usuário):

| campo | uso |
|---|---|
| `id` | chave |
| `user_id` | isolamento por usuário |
| `militar_id` | FK para `militares.id` |
| `ano` | ano de registro do plano (pode divergir do período real em virada de ano) |
| `periodo` | 1, 2 ou 3 |
| `data_inicio` / `data_fim` | intervalo real das férias |

Relação com militares: `militar_id -> militares.id` (nome, posto_graduacao, matrícula).

## 3. Dependências compartilhadas (risco)

`ferias_militares` é lida por outros dois módulos, **por queries próprias, inline**:

- `src/utils/escala.functions.ts` (~linha 2100) — motor de escalas; já usa interseção de datas
  (`lte(data_inicio, fimMes)` + `gte(data_fim, inicioMes)`).
- `src/lib/nbi/consistencia/carregar.ts` — motor de consistência NBI.

Não existe nenhuma função compartilhada de férias: cada módulo tem sua própria query.
Portanto **o risco de acoplamento é nulo** desde que a nova consulta seja um arquivo novo.
Nada em Escalas/NBI será tocado.

Volume: poucas dezenas/centenas de linhas por usuário; a query já é filtrada por `user_id`.
**Não há necessidade de índice novo** nem de migração.

## 4. Proposta de implementação isolada

```
/app/ferias
 └─ aba "Consultar por mês/ano"
     └─ src/lib/ferias/consultaMensal.ts   (query + derivações, puro/isolado)
     └─ src/components/ferias/ConsultaMensal.tsx (UI exclusiva)
```

Query (somente leitura, cliente Supabase, RLS do próprio usuário):

```
from("ferias_militares")
  .select("id, militar_id, ano, periodo, data_inicio, data_fim")
  .eq("user_id", uid)
  .lte("data_inicio", ultimoDiaDoMes)
  .gte("data_fim", primeiroDiaDoMes)
```
mais um `select` em `militares` para nome/posto/matrícula. Zero escrita.

Derivações apenas para exibição (funções puras, sem tocar dados):
- total de militares encontrados e total de períodos;
- dias do período que caem dentro do mês (sobreposição);
- classificação: "integralmente no mês", "inicia no mês", "termina no mês", "atravessa o mês".

UI: duas abas na tela atual — **Pesquisar por militar** (comportamento atual, inalterado) e
**Consultar por mês/ano** (seletor de mês, seletor de ano, atualização automática),
com título "Férias em Agosto de 2026" e tabela Militar / Período / Início / Fim
(+ dias no mês e etiqueta de classificação).

### Arquivos criados
- `src/lib/ferias/consultaMensal.ts`
- `src/components/ferias/ConsultaMensal.tsx`
- `src/lib/ferias/__tests__/consultaMensal.test.ts`

### Arquivos alterados
- `src/routes/app.ferias.tsx` — apenas envolver o conteúdo atual em abas e montar o novo
  componente na segunda aba. Nenhuma alteração na lógica de carregamento/salvamento atual.

### Nada de: migração, trigger, índice, alteração de schema, alteração de dados, publicação.

## 5. Testes previstos (funções puras de interseção/derivação)

Férias inteiramente dentro do mês; iniciadas no mês anterior; terminadas no mês seguinte;
período que engloba o mês inteiro; período totalmente fora; virada dezembro→janeiro;
fevereiro em ano bissexto (29 dias); militar com mais de um período no mesmo mês;
dois militares no mesmo período; consulta sem resultado; e verificação de que o filtro por
nome/matrícula atual continua com o mesmo comportamento.

## 6. Confirmação de isolamento

Escalas (ordinárias, extraordinárias, 24x72, XLSX, PDF, auditoria, disponibilidade) e NBI
(motores, templates, numeração, substituições, consistência, DOCX) **permanecem intocados**.
Segurança, autenticação, assinaturas e pagamentos também. A nova consulta é somente leitura.
