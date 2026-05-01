## Diagnóstico das duas planilhas geradas

### 1) HE no dia 01 — o que aconteceu

Vários militares aparecem com `HE15`, `HE16`, `HE18` na coluna do dia 01 mesmo sem terem sido marcados como "virada do mês anterior". Exemplos das suas planilhas:

- **Sd Antônio Tolfo** — `HE18` no dia 01, depois entra de serviço `234` no dia 02.
- **Sgt Junior Boton, Sgt Paulo Roberto, Sd Cláudio, Sd Gustavo, Sd Michel, Sd Patrick** — todos com `HE15` no dia 01 e entrando de serviço `234` no dia 02.
- **Sgt Ademir** — `HE6` no dia 03 logo após sair de plantão dia 01-02.

**Causa raiz** (linha 900–911 de `src/utils/escala.functions.ts`):

A **etapa 5 (acerto de carga horária)** detecta que um militar com 8 plantões 24h fechou ~192h num mês de 31 dias (alvo 177h) e tenta "converter o excedente em HE". Mas em vez de **deixar a planilha como está** (folga compensa o excesso) ou **reduzir 1 plantão**, o motor pega o excedente e despeja num dia "livre". Como o dia 01 quase sempre está livre antes do primeiro plantão, ele vira o destino padrão.

**Esses HE não fazem sentido operacional**: HE só é lançada quando há furo de guarnição ou comando explícito. Despejar HE só para "fechar matemática" cria HE fantasma e ainda viola a folga obrigatória pré-plantão de 12h (Antônio recebe HE18 dia 01 e entra de plantão dia 02 — proibido).

### 2) Desigualdade nas HE entre Sgts e entre Sds

Observado:
- **Sgts**: HE = 27, 30, 43, 24, 0, 0 (Tte Cortes não conta).
- **Sds**: HE = 48, 53, 53, 53, 53, 14, 53, 32, 53, 53, 32 — Lucas Crummenauer aparece com 0 lançamentos mas Total HE = 53 (provavelmente a soma vem de fórmula da planilha, mas as células estão vazias → bug de não-escalonamento).

**Causa**: a IA hoje converte "limitar HE dos sargentos em no máximo 24h cada" e "equalizar HE dos soldados sem fragmentar" em texto livre, mas o **schema da IA não tem essas diretrizes**. Elas são ignoradas pelo motor. O motor segue só a ordem natural de balanço (`cargaH` ascendente) por grupo da escala, sem teto por papel/posto e sem objetivo de equalização explícito.

### 3) Acesso do admin aos dados dos usuários

A UI do admin (`/app/usuarios`) só lê `profiles`. Mas as RLS atuais permitem ao admin **SELECT em todas as tabelas operacionais** dos demais usuários:

- `militares` → policy "Admins veem todos os militares"
- `escalas_geradas` → policy "Admins veem todas as escalas"
- `escalas_ordinarias` → policy "Admins veem todas ordinárias"
- `escala_ordinaria_membros` → policy "Admins veem todos membros"
- `ferias_militares` → policy "Admins veem todas as férias"

Hoje a UI não expõe esses dados, mas qualquer chamada direta `supabase.from("militares").select("*")` por um admin retorna o efetivo cadastrado por todos os outros usuários — quebra a isolação que você quer.

---

## Plano de correção

### A) Motor: eliminar HE fantasma da etapa 5

Em `src/utils/escala.functions.ts`, etapa 5 (bloco `if (cargaOrd > cargaMin)`):

- **Remover** o despejo de "excedente em HE" em dias livres. Plantões 24h são fato consumado — se o militar fez 8 plantões e ficou acima da carga mínima, isso já é compensado em folga, **não vira HE automática**.
- Manter na etapa 5 só o caminho **faltante** (CM para fechar carga abaixo do alvo). O excedente passa a ser apenas reportado em alerta info (ex.: "Sgt Fulano fechou 192h vs 177h alvo — folga compensa, sem HE automática").

Resultado: deixa de aparecer `HE15/16/18` no dia 01 vindo do motor. As únicas HE no mês passam a vir de:
1. Comando explícito do usuário (observações livres).
2. Furo de guarnição na etapa 4 (HE para tapar dia abaixo do alvo de militares/dia).
3. Virada do mês anterior (`HE8` quando o usuário marcar tipo "he" no painel).

### B) Bloqueio de HE em folga pré-plantão

Estender a etapa 4 (e qualquer lançamento HE):

- Se o militar tem ORD `234` no dia D+1, **bloquear** HE no dia D (folga pré-plantão de 12h).
- Se o militar tem ORD `234` no dia D-1 (com `1` no D), **bloquear** HE no dia D (folga pós-plantão).

### C) Diretrizes "limite de HE por sargento" e "equalizar HE dos soldados"

Duas frentes:

**1. Expandir o schema da IA** em `interpretarObservacoes`:

Adicionar nova seção `limitesHe`:
```ts
limitesHe: {
  postoOuPapel?: "sgt" | "sd" | "cb" | "ten" | "all";
  matricula?: string;
  nome?: string;
  maxHoras: number;        // teto absoluto de HE no mês
  equalizar?: boolean;     // tentar igualar entre os alvos
  evitarFragmentar?: boolean; // preferir blocos múltiplos de 6/8h
}[]
```

A IA passa a interpretar frases como:
- "limitar HE dos sargentos em no máximo 24 cada" → `{ postoOuPapel: "sgt", maxHoras: 24, equalizar: true }`
- "equalizar HE dos soldados sem fragmentar" → `{ postoOuPapel: "sd", maxHoras: 999, equalizar: true, evitarFragmentar: true }`

**2. Aplicar no motor**:

Na etapa 4 (HE para tapar furo), antes de escolher candidato:
- Filtrar candidatos cujo total de HE no mês já atingiu `maxHoras`.
- Quando `equalizar=true`, preferir o candidato com **menor total de HE** dentro do grupo de papel/posto, não o de menor `cargaH`.
- Quando `evitarFragmentar=true`, lançar HE em blocos de 24h (HE16+HE8) preferencialmente; só fragmentar (HE6, HE8 isolados) em último caso.

Adicionar também o teto máximo na etapa 5 (caso ainda gere HE por furo): se ultrapassar `maxHoras`, parar de lançar.

### D) Bug do soldado "fantasma" (Lucas Crummenauer 0 lançamentos)

Investigar por que `Lucas Crummenauer` aparece sem nenhum `234` na escala. Hipóteses prováveis a checar:
- Não tem grupo de escala ordinária definido (`grupoOrdem = undefined`) → função `escolher` linha 661 só pega `m.grupoOrdem === grupoDoDia`, então ele nunca é candidato.
- Conflito de função (não é CG nem COV → só elegível como BM, mas o `escolher("BM")` requer grupo igual ao dia).

Fix: quando não há candidato no grupo do dia, **expandir busca para fora do grupo** (já existe um fallback parcial; reforçar para que militares sem grupo entrem na rotação por menor `cargaH`).

### E) Isolar dados por usuário (revogar acesso global do admin)

Migration SQL removendo as 5 policies "Admins veem todos" das tabelas operacionais:

```sql
DROP POLICY "Admins veem todos os militares"  ON public.militares;
DROP POLICY "Admins veem todas as escalas"   ON public.escalas_geradas;
DROP POLICY "Admins veem todas ordinárias"   ON public.escalas_ordinarias;
DROP POLICY "Admins veem todos membros"      ON public.escala_ordinaria_membros;
DROP POLICY "Admins veem todas as férias"    ON public.ferias_militares;
```

Mantém `Admins veem todos os perfis` (necessário para a tela `/app/usuarios` continuar funcionando) e `Admins gerenciam papéis` (aprovar/bloquear).

Resultado: cada usuário só enxerga seu próprio efetivo, escalas, férias e grupos — inclusive o admin (que vira "admin de contas", não "admin de dados").

---

## Arquivos afetados

- `src/utils/escala.functions.ts` — etapas 4 e 5 do motor + schema da IA + nova seção `limitesHe` + bloqueios de folga + fix do soldado sem grupo.
- Nova migration SQL — drop das 5 policies "Admins veem todos" em tabelas operacionais.

Sem alterações na UI (`app.importar.tsx`, `app.militares.tsx`, etc.) nesta rodada — só backend.
