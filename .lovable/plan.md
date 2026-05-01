## Diagnóstico das 4 escalas reais (Janeiro/Fevereiro/Março/Maio 2026)

Análise célula a célula confirmou os padrões reais. O motor atual (`src/utils/escala.functions.ts`) tem desvios em relação à prática do quartel. Este plano corrige tudo num único arquivo, sem mudanças de UI, schema, banco ou `xlsx-surgical.ts`.

### Padrões REAIS observados

| # | Regra | Evidência |
|---|---|---|
| 1 | Serviço 24h ORD = sempre 2 células: `234` em D + `1` em D+1. Nunca `2341`. | Todas as 4 escalas, todos os militares operacionais |
| 2 | Carga mínima mensal: 28d→160, 29d→165, 30d→171, 31d→177 | Janeiro/Maio/Março (31d)=177; Fevereiro (28d)=160 |
| 3 | Carga reduz proporcional aos dias afastados | Vinicius FER 10d em maio→120; Patrick FER 10d→114 |
| 4 | **Virada mês anterior (dia 01)**: quem fez 24h ORD em D31 anterior → ORD=`1` + EXP=`CM2` no dia 01. Se foi HE → `HE8` no dia 01. | Janeiro dia 01 vários militares com `1`+CM2 ou HE8 |
| 5 | **Virada para mês seguinte (último dia)**: serviço 24h iniciado no último dia → só `234` (18h). As 6h de `1` vão para a próxima escala. NÃO lançar CM no último dia para "compensar" virada. | Março: Robson 31/03 só tem `234` |
| 6 | **CM = fechamento de carga**: lançado na linha **EXP** dos últimos dias do mês para fechar `Carga Horária Mensal`. Pode estar junto com sigla ORD parcial, ou em dia livre. Aceita qualquer dia (não só útil). | Maio Junior dia 30 `CM2` dia 31 `CM1`; Março Diesel `23`+`CM4`+`CM5` |
| 7 | **HE 24h = SEMPRE par `HE16`+`HE8`** (regra confirmada pelo usuário). HE parciais (<16h) em uma célula só (HE12, HE4, HE7…). | Maio Cláudio Pezzini várias sequências `HE16`/`HE8` |
| 8 | Afastamentos lançados na linha ORD em TODOS os dias do período | Cristiano Petter LAA o mês inteiro; Glauber TRA 5–9 |
| 9 | **Variação "escala parcial"**: alguns militares (tipicamente oficiais, ex. Ten Jorge Luis Cortes) NÃO entram em 24h. Recebem apenas turnos parciais `2` (6h), `23` (12h), ocasionalmente `3`. Sequência distribuída em dias úteis. Carga fecha em 177h via parciais + CMx no fim. | Março: Ten Jorge Luis com sequência de `2` e `23` + `CM3` dia 31; Maio: idem, `2`/`23`/`3` |

### Mudanças no código (`src/utils/escala.functions.ts`)

#### A. Tabela exata de carga base
```ts
const cargaBase = (d: number): number =>
  ({ 28: 160, 29: 165, 30: 171, 31: 177 } as Record<number, number>)[d] ?? 177;
```

#### B. Garantir quebra `234`+`1` sempre
Auditar todos os caminhos que escrevem ORD. Banir `2341` em uma célula só. `lancaServico24` já faz certo; corrigir o ramo de "lançamentos diretos da IA" e qualquer outro.

#### C. NOVA 0ª etapa — Virada do mês anterior
Adicionar nova seção no schema da IA:
```ts
interface ViradaAnteriorIA {
  matricula?: string;
  nome?: string;
  tipo: "ord" | "he";   // serviço 24h ordinário ou HE
}
```
Atualizar prompt e tools para que a IA extraia frases como "Sgt X de serviço dia 31 do mês passado" / "Cb Y fez HE no último dia do mês anterior".

Aplicação no dia 01 do mês corrente:
- `ord` → `ord[1].set(rowOrd, "1")` + `expm[1].set(rowOrd, "CM2")`. +8h em `cargaH`. Bloqueia ORD nos dias 1 e 2 (cooldown).
- `he` → `he[1].set(rowOrd, "HE8")`. Bloqueia ORD no dia 1.

#### D. Suporte a "escala parcial" (Ten Jorge Luis e similares)

**Novo campo no cadastro de militares**: `tipo_escala` na tabela `militares` — enum `"24h" | "parcial"`. Default `"24h"`.

- Migration que adiciona a coluna com default `'24h'`.
- Tela `app.militares.tsx` ganha um select Tipo de escala (24h x Parcial).
- Motor: militares com `tipo_escala = "parcial"` NÃO são candidatos no loop principal de seleção 24h. Em vez disso, ganham uma **6ª etapa** específica:

```text
para cada militar PARCIAL ativo (não-ADM):
  cargaMin = base ajustada por afastamento
  distribuir turnos parciais nos dias úteis preferencialmente:
    - mistura de "23" (12h) e "2" (6h) seguindo padrão observado
    - aceitar "3" (6h) quando necessário
    - parar quando ∑horas ≥ cargaMin − 16
  fechar com CM<resto> no EXP do último dia útil
```

Distribuição: pegar os ~22 dias úteis do mês, alternar `23` (segunda) com `2` (resto da semana), ajustando para fechar carga.

#### E. CM de fechamento — preferir últimos dias do mês (qualquer dia)

Reescrever ramo FALTANTE da 5ª etapa atual:
1. Encontrar o(s) último(s) dias do mês (não só úteis) onde militar tem ORD parcial OU está livre.
2. Lançar `CM<faltam>` (máx 16) na linha EXP do dia mais ao fim do mês primeiro.
3. Continuar para penúltimo, antepenúltimo etc. até zerar `faltam`.

#### F. HE excedente — sempre par `HE16`+`HE8`

Reescrever ramo EXCEDENTE da 5ª etapa:
- Para cada bloco de 24h: encontrar par de dias livres consecutivos (D, D+1) ambos sem ORD/HE/afast → `HE16` em D + `HE8` em D+1.
- Resto < 16h: lançar em uma célula só `HE${restante}` num dia livre.
- Último dia do mês: HE máx 16h (a parte restante vai para o próximo mês como virada — alerta `info`).

#### G. Cooldown e bloqueio de ORD após virada
Militares com virada do mês anterior ficam bloqueados para nova ORD nos dias 1 e 2 do mês corrente (12h folga + 24h descanso após o serviço D31+D01).

### Alertas finais (consolidados, 1 linha cada)
- Virada do mês anterior aplicada
- CM lançados (fechamento de carga)
- HE excedente convertido
- Militares com HE truncada no último dia (foi para mês seguinte)
- Afastamentos (já existe)

### Arquivos alterados

1. **`src/utils/escala.functions.ts`** — schema `InterpretacaoIA` ganha `viradaAnterior`; prompt+tools atualizados; nova 0ª etapa (virada); banir `2341`; tabela `cargaBase` exata; reescrita FALTANTE (CM no EXP do fim, qualquer dia); reescrita EXCEDENTE (HE16+HE8); nova 6ª etapa para `tipo_escala = "parcial"`; militares parciais filtrados do loop principal.

2. **Migration SQL** — `ALTER TABLE militares ADD COLUMN tipo_escala text NOT NULL DEFAULT '24h' CHECK (tipo_escala IN ('24h','parcial'))`.

3. **`src/routes/app.militares.tsx`** — adicionar `<Select>` "Tipo de escala" (24h | Parcial) no formulário de cadastro/edição. Persistir no insert/update.

4. **`src/routes/app.escalas.tsx`** — na tela de Escalas Ordinárias, militares "parcial" não aparecem nos cards de seleção (eles entram automaticamente como parciais, sem precisar marcar em escala).

Sem mudanças em `xlsx-surgical.ts`, no schema do Supabase além do `ALTER TABLE`, ou em qualquer outra rota.

### Validação esperada
- **Ten Jorge Luis Cortes** (parcial): março → sequência `2`/`23` em dias úteis, total ~174h ORD parcial + `CM3` no dia 31 = 177h ✅
- **Junior Boton** (24h): dias com `234`/`1` alternando + `CM2`/`CM1` no fim = 177h ✅
- **Vinicius FER 10d** (24h, maio): carga = 120h, distribuição de `234`/`1` nos 21 dias restantes ✅
- **Cristiano Petter LAA** (24h afastado): linha ORD = LAA todo mês, totais 0/0 ✅
- **Virada janeiro→fevereiro Patrick**: se obs disser "Patrick fez 24h ORD em 31/01" → fevereiro dia 01: ORD=`1` + EXP=`CM2`, ORD bloqueada dias 1–2 ✅
