## Problema

Na última escala, militares **ADM** apareceram com expediente (EXP) em sábados, domingos e/ou feriados. Pela regra do quartel, ADM cumpre EXP **apenas em dias úteis** (seg-qui = EXP9, sex = EXP6). Para militares operacionais, CM/EXP em fim de semana é legítimo (faz parte do plantão) — eles ficam fora desta correção.

## Diagnóstico

Em `src/utils/escala.functions.ts` os 3 pontos que escrevem EXP para ADM já chamam `isDiaExpediente(...)` (linhas 1347, 1362, 1813), então o lançamento direto não deveria cair em fds. Mesmo assim apareceu, o que aponta para uma destas três causas residuais:

1. **Lançamento via observações livres da IA** (linha 716) — se a IA interpretar "lançar EXP9 dia 30" e 30 cair num sábado, o lançamento entra sem filtro.
2. **Feriado fora da lista nacional** (`feriadosBrasil`, linhas 170-187) — feriados estaduais/municipais (ex.: 23/05 SP, dia do servidor estadual etc.) não estão na lista, então `isDiaExpediente` os trata como dia útil e o ADM ganha EXP.
3. **Conteúdo residual da planilha** — alguma célula da linha EXP do bloco ADM não foi limpa (merge / fórmula) e sobreviveu na saída.

## Solução

Defesa em profundidade: depois de toda a lógica de geração, e **antes** de serializar o xlsx, varrer todos os militares com `isAdm=true` e **apagar qualquer entrada de `expm` em dia que não seja `isDiaExpediente`**. Como a regra do quartel é absoluta para ADM, esse saneamento é seguro e cobre as três causas acima de uma vez.

Adicionalmente:

- Registrar um alerta `info` listando exatamente quais células ADM foram saneadas (militar + dia + sigla removida), para o usuário ter rastreabilidade.
- Acrescentar saneamento simétrico na linha **HE** dos ADM em fds/feriado (mesma justificativa: ADM não trabalha fora do horário comercial; HE em sábado é incoerente).
- Garantir que, mesmo quando vier do passo de "lançamento direto" da IA (linha 681+), siglas EXP/HE em ADM em fim de semana sejam descartadas com um `warn` no momento do parse — assim o usuário descobre que sua observação está em conflito com a regra fixa.

## Código

Arquivo único alterado: `src/utils/escala.functions.ts`.

1. **Saneamento final ADM** — novo bloco logo após a "6ª ETAPA — Sanidade final" (linha ~1488), antes da "7ª ETAPA":

```ts
/* 6.5ª ETAPA — ADM nunca tem EXP/HE em sábado, domingo ou feriado.
   Defesa em profundidade contra lançamentos manuais da IA, feriados
   estaduais ausentes da lista nacional e resíduos do XML original. */
const saneadosAdm: string[] = [];
for (const m of militares) {
  if (!m.isAdm) continue;
  for (let d = 1; d <= dias; d++) {
    if (isDiaExpediente(ano, mes, d)) continue;
    const sExp = expm.get(d)?.get(m.rowOrd);
    if (sExp) {
      expm.get(d)!.delete(m.rowOrd);
      saneadosAdm.push(`${m.nome} dia ${d}: EXP ${sExp} removido`);
    }
    const sHe = he.get(d)?.get(m.rowOrd);
    if (sHe) {
      he.get(d)!.delete(m.rowOrd);
      saneadosAdm.push(`${m.nome} dia ${d}: HE ${sHe} removido`);
    }
  }
}
if (saneadosAdm.length) {
  alertas.push({
    tipo: "info",
    msg: `ADM saneado (sem EXP/HE em fds/feriado): ${saneadosAdm.join("; ")}.`,
  });
}
```

2. **Bloqueio na origem (lançamentos da IA)** — dentro do loop em `~704-718`, quando o destino for militar ADM em dia não-expediente para linha EXP/HE, descartar com `warn`:

```ts
for (const m of alvos) {
  if (m.isAdm && (linha === "EXP" || linha === "HE") && !isDiaExpediente(ano, mes, d)) {
    alertas.push({
      tipo: "warn",
      msg: `Lançamento ${sigla} ignorado para ${m.nome} dia ${d}: ADM não trabalha em fds/feriado.`,
    });
    continue;
  }
  // ...resto do código original
}
```

3. **Sem mudanças** nas 3 rotinas de criação de EXP ADM já existentes (1347, 1362, 1813) — elas já filtram corretamente; o saneamento final apenas garante o invariante.

## Fora de escopo

- Cadastro de feriados estaduais/municipais (pode virar um próximo pedido — hoje a defesa é a remoção pós-fato).
- Alterações em CM/EXP de militares operacionais 24h em fds — segundo confirmação do usuário, são legítimos.
