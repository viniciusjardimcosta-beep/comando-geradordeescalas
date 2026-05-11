## Diagnóstico

O Sd **Antonio Tolfo Flores** (matrícula `3715248`) está cadastrado **duas vezes** no banco:

| ID | Escalas associadas | Férias |
|---|---|---|
| `6fee2152…` | Escala 1 (abr), Escala 2 (mai), **Escala 2 (jun)** | 20–28/mai e 20–28/jun |
| `dfb98c95…` | Escala 2 (mai) apenas | — |

Como há dois registros com a **mesma matrícula**, o gerador (que casa militares ↔ aba Efetivo da planilha pelo ID Func) provavelmente:
- Encontra duas linhas candidatas e descarta uma como duplicata, **OU**
- Casa o militar com a linha errada e o lançamento vai pra um slot que depois é sobrescrito/ignorado, **OU**
- Em alguma etapa de dedupe interna ele é removido inteiramente.

Resultado: ele não aparece em nenhum dia de junho, mesmo sendo CG/COV operacional ativo.

## Plano de correção

### 1. Limpeza imediata dos dados (migration)
- Identificar todas as duplicatas de militar por `(user_id, matricula_norm)` onde `matricula_norm` não é nulo.
- Para cada grupo: manter o ID mais "rico" (com mais memberships e/ou férias) e migrar referências do duplicado para esse ID em:
  - `escala_ordinaria_membros`
  - `ferias_militares`
- Remover o registro duplicado.
- No caso do Antonio Flores: manter `6fee2152…` (tem 3 memberships + férias) e remover `dfb98c95…` após mover sua membership de Escala 2/mai.

### 2. Prevenir novas duplicatas (migration)
- Adicionar índice único parcial em `militares (user_id, matricula_norm) WHERE matricula_norm IS NOT NULL AND ativo = true`.
- Garante que o mesmo quartel não cadastre dois militares ativos com a mesma matrícula.

### 3. Tela de cadastro de militares (frontend)
- Tratar o erro de violação de unicidade com mensagem amigável: "Já existe um militar ativo com esta matrícula".
- Opcional: na criação, fazer um pré-check via select para avisar antes de submeter.

### 4. Robustez no gerador (`src/utils/escala.functions.ts`)
- Ao montar a lista de militares para o mês, deduplicar defensivamente por `matricula_norm` (manter o primeiro com membership na escala selecionada) e emitir um **alerta** listando duplicatas detectadas — assim, mesmo que apareça uma duplicata futura, o usuário é avisado em vez de o militar sumir silenciosamente.
- Confirmar (e logar via alerta) quando um militar com membership na escala não consegue casar com nenhuma linha da aba Efetivo, para facilitar diagnóstico futuro.

### 5. Verificação
- Após a limpeza, regerar a escala de **junho/2026 – Escala 2** e confirmar que o Sd Flores aparece nos dias esperados (respeitando férias 20–28/jun).

## Detalhes técnicos

- A duplicação foi detectada por: `SELECT … FROM militares WHERE nome ILIKE '%flores%'` retornou 2 linhas com mesma matrícula 3715248, ambos `ativo=true`, `is_cg=true`, `is_cov=true`, `is_adm=false`, `tipo_escala='24h'`.
- A migration de unicidade usa índice parcial para não bloquear casos legítimos de matrícula nula ou militares inativados (histórico).
- A migração de referências é feita em transação única para evitar memberships órfãs.
