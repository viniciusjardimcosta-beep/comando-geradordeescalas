## Diagnóstico

### Bug 1 — Férias (plano anual) não aplicadas como FER

`gerarEscala` filtra `ferias_militares` por `eq("ano", data.ano)` (linha 1814 de `src/utils/escala.functions.ts`). Esse campo `ano` é o "ano do plano" registrado pelo usuário na tela de Férias — e **não corresponde ao ano do período**. Exemplo real do banco: várias linhas com `ano = 2026` cobrindo `data_inicio = 2025-12-05 … data_fim = 2025-12-20`. Ao gerar a escala de **dezembro/2025** o sistema consulta `ano=2025`, não acha nada e nenhum FER é injetado em `ia.afastamentos`. Períodos que cruzam virada de ano também são perdidos.

### Bug 2 — Militar ADM ultrapassa a carga horária mensal

A etapa 6.2 lança `EXP9` (seg-qui) + `EXP6` (sex) em todo dia útil sem limite, e a etapa 6.5 (linhas 1389-1427) só **adiciona** expediente quando o total está abaixo do alvo — nunca remove o excedente. Para meses como dezembro/2025 (5 segundas, 5 terças, 5 quartas, 4 quintas, 4 sextas) a base já totaliza 19·9 + 4·6 = **195 h**, contra alvo `cargaBase(31) = 177 h`. Resultado: AK do ADM fica em vermelho.

## Correções

Arquivo único: `src/utils/escala.functions.ts`.

### 1) Carregar férias por intervalo de datas, não por ano
Substituir o filtro `eq("ano", data.ano)` da query `ferias_militares` por uma sobreposição com o mês alvo:
- calcular `inicioMes = YYYY-MM-01` e `fimMes = último dia do mês` em ISO;
- usar `.lte("data_inicio", fimMes).gte("data_fim", inicioMes)` para trazer todo período que cruza o mês (cobre virada de ano).

Manter o restante da expansão dia-a-dia já existente (linhas 1900-1913), que já filtra por `getUTCFullYear() === data.ano && getUTCMonth()+1 === data.mes`.

### 2) Capar carga ADM no alvo proporcional
Reescrever o ramo `if (m.isAdm)` da etapa 6.5 (linhas 1389-1427) para:

1. Calcular `alvoAdm = cargaMensalProporcional(diasAfAdm)` e `totalExp` atual.
2. Se `totalExp > alvoAdm` → **remover/encurtar EXP do fim do mês para o início** até `totalExp == alvoAdm`:
   - Iterar `d` do último dia útil para o primeiro;
   - Pular dias com `naoEscalar` ou `ord` (afastamento);
   - Para cada `EXP*`/`CM*`/`TELE*` existente: reduzir a hora da sigla (`EXP9` → `EXP{9-x}`); se chegar a 0, remover a sigla;
   - Continuar até zerar o excedente.
   - Registrar em `acertosExpAdm` (`"NOME (-Xh EXP — teto mensal)"`).
3. Se `totalExp < alvoAdm` → manter as duas passadas atuais (aumentar siglas existentes até 12h, depois lançar EXP novo).
4. Se igual → nada a fazer.

Não alterar a etapa 6.2 (manter o lançamento padrão EXP9/EXP6); o cap fica concentrado na etapa 6.5 para preservar a regra de “seg-qui = 9h, sex = 6h” quando couber, e só comprimir os dias finais quando estourar.

Manter intactas as etapas 6.5.1 (modo ordinário puro), 6.6 (HE ADM só após fechar carga) e demais regras já existentes.

## Validação

- Build do projeto.
- Re-gerar escala de dezembro/2025 e conferir:
  - Militares com período em `ferias_militares` recebem `FER` nos dias do plano (via alerta consolidado);
  - AK dos ADM não estoura — alerta `Expediente complementar (ADM)` mostra os ajustes (`-Xh EXP — teto mensal` quando aplicável).
