## Email/login no Supabase

Contas cadastradas no projeto:

- **comandogeradordeescalas@gmail.com** — Administrador (role: admin) — criado em 14/05/2026
- viniciusj.costa@hotmail.com — usuário aprovado
- ademir.gunsch@icloud.com — usuário aprovado

O login de admin que você usa no sistema é **comandogeradordeescalas@gmail.com**. Senha não é exposta — se precisar, use "Recuperar" na tela de login.

---

## Proteção contra loop infinito na geração da escala

### Diagnóstico

Hoje em `src/utils/escala.functions.ts` todos os `while` da geração (CGs, COVs, completar 24h, HE, força-exceção, complemento CM) já têm condição de parada explícita (`if (!m) break`). Não há loop infinito real, mas:

1. Não há **teto global de tentativas/iterações** por dia — se um bug futuro fizer um candidato ser sempre "consumido sem preencher", o loop poderia girar.
2. Quando não há solução, o motor segue silenciosamente para o próximo dia e o usuário só vê alertas dispersos. Não há **interrupção dura** com mensagem clara tipo "Não foi possível completar o efetivo do dia X".
3. Não existe um **timeout total** da geração.

### Plano de implementação (escopo somente em `escala.functions.ts` e UI de importar)

**1. Guardas de iteração por dia (motor `escalar`)**
- Adicionar constante `MAX_ITER_POR_DIA = 200` em cada `while` de preenchimento (CG, COV, completar, HE auto, HE forçado). Cada iteração incrementa um contador; ao estourar, `break` + push em novo array `falhasCriticas` com `{ dia, etapa, motivo }`.

**2. Teto global da geração**
- Contador `iterTotal` somando todos os loops do motor. Limite `MAX_ITER_TOTAL = 50_000`. Se estourar → lança `EscalaLoopError` interrompendo a geração imediatamente.

**3. Detecção de "dia impossível"**
- Ao final do laço por dia (após etapas auto + forçado), se `faltamFinal > 0` OU `cgFalta > 0` OU `covFalta > 0`, registrar entrada em `falhasCriticas` com mensagem padronizada:
  > "Não foi possível completar o efetivo do dia D. Nenhum militar disponível atende todas as regras (faltam: X militares, Y CG, Z COV)."
- Manter o diagnóstico atual de motivos (teto HE, folga 12h, afastamento) como detalhe da mesma falha.

**4. Política de interrupção**
- Novo parâmetro opcional `pararEmDiaImpossivel` (default `true`). Quando `true`: ao registrar 1ª falha crítica, interrompe geração e retorna `{ ok: false, falhasCriticas, alertas }` em vez de prosseguir.
- Quando `false` (uso futuro / debug): continua mas marca a escala como `status: "incompleta"`.

**5. Tipos e retorno do server function `gerarEscala`**
- Estender retorno com `falhasCriticas?: Array<{dia:number, etapa:string, motivo:string}>`.
- Em caso de interrupção: NÃO salvar arquivo no storage, NÃO inserir em `escalas_geradas`, devolver status HTTP 200 com `{ ok:false, falhasCriticas }` (ou throw `Response(422)` — decidir; preferência: `ok:false` para a UI tratar sem erro de rede).

**6. UI — `src/routes/app.importar.tsx`**
- No handler `gerar`: se `result.ok === false && result.falhasCriticas`, exibir `toast.error` com a primeira mensagem e abrir um `AlertDialog`/seção listando todas as falhas críticas (dia + motivo). Não tentar baixar.
- Botão "Tentar novamente" reabre a tela de observações para o usuário ajustar afastamentos/efetivo.

### Detalhes técnicos

- Sem mudanças de schema, sem migration.
- Sem alteração nas regras de escala (cooldown 12h, 24x72, mín CG/COV) — só adiciona guardas e telemetria.
- Sem mudança no modo demonstração (continua truncando em 7 dias antes do motor).
- Mensagens em português, no padrão dos alertas existentes.

### Arquivos alterados

- `src/utils/escala.functions.ts` — guardas, `falhasCriticas`, retorno estendido.
- `src/routes/app.importar.tsx` — tratamento de `ok:false` + dialog de falhas.
