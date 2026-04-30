## Diagnóstico

Hoje `src/utils/escala.functions.ts` carrega a planilha com **ExcelJS** (`wb.xlsx.load(...)`), preenche as células e regrava com `wb.xlsx.writeBuffer()`. O ExcelJS, ao serializar de volta, **descarta ou simplifica** vários recursos do .xlsx original:

- Listas suspensas (Data Validation) — especialmente quando declaradas em `<extLst>` (validações por intervalo, comuns em planilhas modernas)
- Formatação condicional avançada
- Fórmulas com referências externas / nomes definidos complexos
- Tabelas estruturadas, gráficos, comentários, tabelas dinâmicas
- Estilos de células parcialmente reescritos (fontes, larguras de coluna)

Resultado: o arquivo baixado abre, mas perde os menus de seleção (HE, CM, 2341, etc.), as fórmulas de carga horária e a “editabilidade” original que o usuário precisa.

## Solução

Parar de “desserializar e reserializar” o arquivo. Em vez disso, abrir o `.xlsx` como **ZIP**, ler somente o XML da aba `Anexo B - Escala`, **substituir apenas as células de dia** que precisamos preencher (linhas 8, 10, 11 e blocos de militares a partir da linha 12, colunas F em diante) e **regravar o ZIP** sem tocar em nenhum outro arquivo interno (`xl/styles.xml`, `xl/worksheets/sheet*.xml` das outras abas, `xl/sharedStrings.xml`, `xl/drawings/*`, validações em `extLst`, etc.).

Isso garante que TUDO o que não foi explicitamente alterado permanece byte-a-byte igual ao arquivo enviado pelo usuário — listas suspensas, fórmulas, formatação, macros, tudo.

### Etapas

1. **Adicionar dependência `fflate`** (ZIP puro-JS, leve, funciona no runtime Worker do TanStack Start; sem binários nativos).

2. **Criar `src/utils/xlsx-surgical.ts`** com utilitários:
   - `loadXlsx(bytes)` → `{ files: Record<string, Uint8Array>, workbookXml, sheetMap }` usando `fflate.unzipSync`.
   - `getSheetPath(workbookXml, sheetName)` → resolve nome da aba para caminho `xl/worksheets/sheetN.xml` (via `xl/_rels/workbook.xml.rels`).
   - `readSheetCells(sheetXml)` → parse mínimo via regex/XML simples só para mapear `<c r="F12" .../>`.
   - `writeCells(sheetXml, edits)` → para cada edição `{ ref, value, type }`:
     - Se a célula existe → substitui apenas `<v>` / atributos `t=`/`s=` preservando o restante (fórmula `<f>` é mantida se a edição não for forçada).
     - Se não existe → insere a célula na `<row>` correta, mantendo ordem por coluna.
   - Strings vão como **inline string** (`<c t="inlineStr"><is><t>2341</t></is></c>`) para não mexer em `sharedStrings.xml`.
   - Datas vão como número serial Excel + atributo de estilo herdado (ou simplesmente como inline string `"1"`, `"2"`... para a linha 10 — equivalente ao que já é exibido hoje).
   - `saveXlsx(files)` → `fflate.zipSync` devolvendo `Uint8Array`.

3. **Reescrever a seção 1, 8 e 9 de `src/utils/escala.functions.ts`**:
   - Remover `import ExcelJS from "exceljs"`.
   - Substituir `wb.xlsx.load` por `loadXlsx(bin)`.
   - Para ler **aba Efetivo** (que só lemos, nunca gravamos): manter um caminho de leitura simples — extrair `<row>`/`<c>` da `xl/worksheets/sheetX.xml` correspondente, resolvendo `sharedStrings.xml` quando `t="s"`. Read-only, sem reescrita.
   - Para escrever na aba **Anexo B - Escala**: usar `writeCells` apenas nas referências:
     - `A8` (título do mês)
     - `linha 10` colunas F..F+dias-1 (números de dia 1..N)
     - `linha 11` colunas F..F+dias-1 (rótulos da semana)
     - células dos militares: `(rowOrd + offset, F+(d-1))` para ord/exp/he
   - Limpeza prévia: para cada militar, **só apagar conteúdo das células que estamos prestes a (re)escrever** — em vez de zerar uma faixa inteira de 31 dias × 3 linhas, apagamos `<v>` mantendo `<c>` com seu `s=` (estilo) e `<f>` (se houver fórmula nativa do template, ela é preservada). Isso elimina a chance de quebrar fórmulas pré-existentes.

4. **Não tocar** em: `xl/styles.xml`, `xl/sharedStrings.xml` (a menos que vá ler), `xl/_rels/*`, `[Content_Types].xml`, `xl/drawings/*`, `xl/charts/*`, `xl/pivotTables/*`, `xl/worksheets/*` que não sejam a aba Anexo B.

5. **Manter** todo o motor de escala (etapas 1–4 do modus operandi) intacto — só muda a camada de I/O do arquivo.

6. **QA pós-geração**: após gerar uma planilha de teste, abrir o `.xlsx` resultante com `unzip -l` e diff contra o original — confirmar que os únicos arquivos modificados são `xl/worksheets/sheetN.xml` da aba Anexo B (e nada mais). Validar que as listas suspensas voltam a funcionar abrindo no Excel/LibreOffice.

### Detalhes técnicos

- **fflate** é compatível com Cloudflare Workers (puro JS, sem `Buffer` obrigatório, sem binários). Já é usado em ambientes serverless similares.
- O parser de XML será **regex-based dirigido** (não precisamos de DOM completo): a estrutura de `<sheetData>` é regular o suficiente para edição cirúrgica de `<c r="...">`. Isso evita adicionar `fast-xml-parser` ou similar.
- Inline strings (`t="inlineStr"`) são suportadas nativamente pelo Excel/LibreOffice e não exigem mexer em `sharedStrings.xml`. Perfeito para siglas como `2341`, `EXP9`, `HE24`, `FER`.
- Para preservar o estilo original de cada célula (cor, borda, formato “Texto”), lemos o atributo `s="..."` da célula existente antes de reescrever, e o mantemos. Se a célula não existe, copiamos o `s=` da célula vizinha do mesmo bloco.
- A leitura da aba Efetivo continuará funcionando porque montaremos um pequeno helper `readCell(sheetXml, ref)` que resolve `t="s"` via `sharedStrings.xml` quando necessário.

### Arquivos afetados

- `package.json` — adicionar `fflate`
- `src/utils/xlsx-surgical.ts` — **novo**, ~250 linhas
- `src/utils/escala.functions.ts` — substituir blocos de I/O (seções 1, 3, 8, 9); motor permanece igual
- Remover dependência `exceljs` se não for mais usada em nenhum outro lugar (verificar antes)

### Resultado esperado

O arquivo baixado abre idêntico ao enviado: mesmas listas suspensas em cada linha (HE, CM, 2341/turnos, etc.), mesmas fórmulas de soma de carga horária, mesma formatação condicional. A única diferença são as células de dia preenchidas com as siglas geradas pelo motor.
