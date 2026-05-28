## Objetivo

Garantir que, quando o motor retorna `{ ok:false, motivo, falhasCriticas, alertas }`, o frontend:
- nunca acesse propriedades da escala,
- nunca quebre a tela,
- mostre toast + modal claros,
- permita voltar para observações.

Hoje (`src/routes/app.importar.tsx`) já existe um bloco que trata `ok === false` e abre o `Dialog` de falhas, mas:
- usa apenas `falhas[0]?.motivo` e ignora o campo top-level `motivo` ("loop_excedido", "dia_impossivel") devolvido pelo backend;
- verifica sucesso por `"escritas" in result` (frágil);
- não exibe os `alertas` que vêm junto com a falha;
- não trata o caso `falhasCriticas` ausente / vazio em uma resposta `ok:false` (cairia em "Não foi possível gerar a escala" genérico, ok, mas sem detalhes).

Nenhuma mudança no backend, no motor, na geração da planilha, no schema ou na autenticação.

## Mudanças (somente `src/routes/app.importar.tsx`)

### 1. Validação de resposta em camadas

No handler `gerar`, substituir a checagem atual por um guard estrito, na ordem:

```text
1. !result || typeof result !== "object"   → toast.error + return
2. result.ok === false                     → fluxo de falha controlada (abaixo)
3. result.ok !== true || !("escritas" in result)
                                           → toast.error "Resposta inválida"
4. caso normal: ler escritas, downloadUrl, alertas, demo
```

Nada da escala (`escritas`, `downloadUrl`, `alertas` de sucesso) é lido antes do passo 4. Isso atende ao requisito "antes de acessar qualquer dado da escala, validar `resultado.ok == true`".

### 2. Mensagem de erro priorizada

Mapear `result.motivo` (top-level) para um título amigável:

- `loop_excedido` → "Geração interrompida: muitas tentativas sem solução válida."
- `dia_impossivel` → "Não foi possível completar o efetivo em um ou mais dias."
- outros / ausente → "Não foi possível gerar a escala com as regras atuais."

Toast usa esse título; `description` mostra o primeiro `falhasCriticas[i].motivo` (se existir) ou "Ajuste afastamentos/efetivo e tente novamente." Duração 12 s.

### 3. Estado de falha enriquecido

Trocar `falhasCriticas: { dia, etapa, motivo }[]` por um estado único:

```text
falhaCtrl: null | {
  motivo: string;            // título amigável
  itens: { dia, etapa, motivo }[];
  alertas: { tipo, msg }[];  // do retorno
}
```

O `Dialog` de falhas passa a:
- abrir quando `falhaCtrl !== null`,
- mostrar o título (`falhaCtrl.motivo`),
- listar `itens` (mesma UI atual; vazio → "Sem detalhes por dia."),
- mostrar uma seção "Alertas" colapsável com `falhaCtrl.alertas` quando houver,
- manter botões "Fechar" e "Ajustar observações" (reabre `openObs`).

### 4. Limpeza preventiva

No início de `gerar`, antes do `await`, fazer `setFalhaCtrl(null)` para não misturar com tentativas anteriores. Em caminho de sucesso, **não** tocar em `falhaCtrl` (já é null).

### 5. Captura ampla de exceções

O `try/catch` atual em `gerar` já evita "Something went wrong". Apenas garantir que:
- erros lançados pelo serverFn (HTTP 500, rede) caem no `catch` → `toast.error(msg)` + `console.error`;
- nada do bloco de sucesso (acesso a `result.escritas`, `result.downloadUrl`, etc.) execute fora do `ok === true`.

Não há novo `ErrorBoundary` — o `errorComponent` do TanStack continua atendendo o "fora do controle".

### 6. Sem alterações em

- `src/utils/escala.functions.ts`
- contrato do `gerarEscala` (já devolve `motivo` e `falhasCriticas`)
- modo demonstração (`result.demo` continua sendo lido só no caminho `ok === true`)
- histórico, downloads, virada do mês, observações, modo de geração

## Arquivos alterados

- `src/routes/app.importar.tsx` — refator do `gerar`, novo estado `falhaCtrl`, ajuste do Dialog de falhas.
