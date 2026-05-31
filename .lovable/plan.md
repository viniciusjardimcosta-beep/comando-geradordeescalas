## Objetivo

Adicionar um **Modo Auditoria** que diagnostica a origem exata de qualquer diferença de horas por militar, **sem tocar em uma linha sequer** do motor de geração (`src/utils/escala.functions.ts` lógica de decisão) nem do preenchimento XLSX (`src/utils/xlsx-surgical.ts`).

A auditoria é puramente leitora: recebe o resultado já gerado pelo motor + a planilha final preenchida e produz um relatório linha-a-linha, dia-a-dia, célula-a-célula.

## O que o relatório mostra (por militar)

Tabela única por militar com:

- **Carga mensal prevista** (`cargaMensalProporcional(afastamentos)` — função já existente no motor, apenas reutilizada em modo leitura)
- **Horas ordinárias lançadas** (soma das siglas ORD: `1,2,3,4,12,...,234,1234` — mapa `ORD_HORAS` já existente)
- **CM lançado** (soma de `CM1..CM16`)
- **HE lançadas** (soma de `HE1..HE24`)
- **EXP lançadas** (soma de `EXP1..EXP12` + TELE)
- **Total final** = ORD + CM + HE + EXP
- **Diferença** = Total final − Carga prevista

Quando `Diferença ≠ 0`, expandir um detalhamento:

### Detalhamento passo a passo

Para cada dia 1..N do mês:

| Dia | Célula XLSX | Linha (ORD/EXP/HE) | Sigla lançada | Horas | Acumulado | Fonte |
|-----|-------------|---------------------|---------------|-------|-----------|-------|
| 04  | F37         | HE                  | HE2           | 2     | 18        | motor |
| 05  | G35         | ORD                 | 234           | 18    | 36        | motor |
| 06  | H35         | ORD                 | 1 (virada)    | 6     | 42        | auto-virada |

Onde:
- **Célula XLSX** é resolvida lendo a aba "Anexo B - Escala" diretamente do arquivo gerado em `escalas_geradas.arquivo_saida_path` (mesma lógica de mapeamento de coordenadas que `xlsx-surgical.ts` já usa, apenas em modo leitura).
- **Sigla lançada** vem de duas fontes que são comparadas:
  1. estrutura em memória produzida pelo motor (`Lancamento[]`)
  2. valor real escrito na célula da planilha
- Se as duas fontes divergirem → marcar **"divergência motor↔planilha"** no relatório (isso isola se o problema está na geração ou no preenchimento).

### Classificação automática da causa

No fim do bloco do militar, mostrar diagnóstico:

- `arredondamento` — soma fracionária convertida para inteiro perdeu/ganhou < 1h
- `CM` — total de CM excede/abaixo do esperado para fechar virada
- `HE` — diferença concentrada em siglas HE
- `EXP` — diferença em EXP/TELE
- `leitura da planilha` — célula esperada vazia ou com sigla diferente da gerada em memória
- `virada de mês` — "234" no dia D sem "1" correspondente no dia D+1 (ou vice-versa)
- `fórmula do Excel` — célula de total da planilha (se houver) não bate com soma manual das siglas

## Onde adicionar (sem mexer no motor)

### Novo arquivo: `src/utils/auditoria-escala.ts`
Função pura: `auditarEscala({ militares, lancamentos, cargaPrevista, xlsxBuffer, ano, mes }) → RelatorioAuditoria`.

Reutiliza (importando, sem modificar):
- `ORD_HORAS`, `SIGLAS_COMP_VALIDAS`, `SIGLAS_HE_VALIDAS`, `cargaMensalProporcional`, regex de horas — todos já existem em `escala.functions.ts` e serão **exportados** (única mudança no arquivo do motor: adicionar `export` em constantes já existentes, zero mudança de comportamento).
- Lê a planilha com `xlsx` em modo `cellFormula:false, cellText:true` para extrair o que realmente foi escrito.

### Nova rota: `src/routes/app.auditoria.tsx`
- Lista escalas geradas (`escalas_geradas`)
- Botão "Auditar" por escala → baixa o XLSX do storage, roda `auditarEscala`, mostra:
  - Resumo por militar (tabela)
  - Expandir linha → detalhamento dia-a-dia + diagnóstico
  - Botão "Exportar relatório (CSV)" salvando em `/mnt/documents/` (download)
- Acesso: qualquer usuário aprovado (vê só suas escalas via RLS existente).

### Item no menu lateral
Adicionar "Auditoria" em `src/routes/app.tsx`, visível para todos os usuários aprovados (não só admin — é ferramenta operacional).

## O que NÃO muda

- `src/utils/escala.functions.ts` — **nenhuma alteração de lógica**. Apenas marcar como `export` 3-4 constantes/funções já existentes (`ORD_HORAS`, `cargaMensalProporcional`, `SIGLAS_*`). Zero risco para geração.
- `src/utils/xlsx-surgical.ts` — não tocado.
- Rotas existentes de Escalas, Importar, Militares, Férias, Assinaturas — não tocadas.
- Webhook Nexano, auth, banco — não tocados.

## Entregáveis

1. `src/utils/auditoria-escala.ts` (novo, ~250 linhas, puro)
2. `src/routes/app.auditoria.tsx` (nova rota)
3. Item de menu "Auditoria" em `app.tsx`
4. 3-4 `export` adicionados em `escala.functions.ts` (sem mudar comportamento)

## Critério de sucesso

Ao rodar a auditoria de uma escala com divergência conhecida, o relatório deve apontar **exatamente**:
- qual militar
- qual dia
- qual célula da aba "Anexo B - Escala"
- qual sigla
- qual das 7 causas classificadas

Sem alterar nenhum byte do resultado gerado pelo motor.