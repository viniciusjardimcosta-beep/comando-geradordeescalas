# Roteiro de Homologação Manual — Módulo NBI
### Para operador real do quartel (sem conhecimento técnico)

**Versão:** 1.0 — Bloco 12F
**Duração estimada:** 45 a 70 minutos
**Ambiente:** conta de homologação (banner âmbar "AMBIENTE DE HOMOLOGAÇÃO" no topo da tela)

> Importante: use SOMENTE a conta de homologação informada pelo administrador.
> Todos os documentos gerados neste roteiro recebem numeração "TESTE" e não valem como documento oficial.
> Não é necessário saber nada de informática além de usar o navegador.

---

## Como usar este roteiro

1. Faça uma etapa por vez, na ordem.
2. Depois de cada etapa, preencha a linha correspondente no **Formulário de Registro** (final deste documento ou planilha CSV anexa).
3. Se algo não funcionar, **não tente consertar**: anote o que apareceu na tela e siga para a próxima etapa (ou pare, se estiver impedido de continuar).
4. Anote também tudo que você **não entendeu**, mesmo que tenha funcionado. Dúvida do operador é resultado válido de teste.

**Severidade percebida** (você escolhe, com seu próprio critério):
- **Baixa** — incômodo, dá para trabalhar assim.
- **Média** — atrapalha, mas consigo terminar o documento.
- **Alta** — precisei improvisar ou refazer trabalho.
- **Crítica** — impossível concluir o documento.

---

## Etapa 1 — Acessar o módulo NBI

**Ação:** entrar no sistema com o usuário de homologação e abrir o menu **NBI**.

**Resultado esperado:**
- O banner âmbar "AMBIENTE DE HOMOLOGAÇÃO" aparece no topo.
- O menu mostra as opções: Nova NBI, Histórico, Pendências e Configurações.

**Anotar:** o menu ficou claro? Você saberia dizer o que cada opção faz só pelo nome?

---

## Etapa 2 — Conferir dados institucionais

**Ação:** abrir **NBI → Configurações** e conferir:
- Estado, Secretaria, Corporação, Batalhão, Subunidade e Cidade (cabeçalho);
- Nome e sigla do Boletim;
- Digitador, Comandante e Autoridade (nome, posto/quadro e função).

**Resultado esperado:** todos os campos preenchidos e escritos exatamente como no boletim oficial da unidade.

**Anotar:** algum campo está errado, faltando ou com nome diferente do usado no quartel?

---

## Etapa 3 — Iniciar uma Nova NBI

**Ação:** clicar em **Nova NBI** e conferir a Etapa 1 (dados do documento): data do documento e ano.

**Resultado esperado:** a tela abre em branco, com a data já sugerida, sem número atribuído (o número só é gerado no final).

**Anotar:** ficou claro que o número ainda NÃO foi reservado?

---

## Etapa 4 — Adicionar um assunto simples (Férias)

**Ação:** adicionar o assunto **Férias**:
1. escolher o assunto na lista;
2. escolher o militar;
3. preencher período, data de início e data de fim (ou aproveitar um período já cadastrado);
4. conferir o texto que o sistema montou.

**Resultado esperado:**
- o texto aparece completo, sem trechos como `{{ALGUMA_COISA}}`;
- posto, nome de guerra, matrícula e lotação aparecem corretos;
- as datas aparecem no formato dd/mm/aaaa.

**Anotar:** o texto está exatamente como o quartel escreve hoje? Alguma palavra estranha?

---

## Etapa 5 — Interpretação por frase

**Ação:** onde houver o campo de interpretação por frase, digitar por exemplo:
`2º período de férias do Sargento <nome de um militar cadastrado>`
e conferir o que o sistema preencheu sozinho.

**Resultado esperado:** o sistema identifica o período, o posto e o militar e preenche os campos.

**Anotar:** o sistema acertou o militar? Você confiaria nesse preenchimento sem revisar?

---

## Etapa 6 — Adicionar múltiplos assuntos

**Ação:** acrescentar, no mesmo documento, pelo menos mais 4 assuntos de tipos diferentes, por exemplo:
- Apresentação (após férias);
- Viagem;
- Assunção de função;
- Dispensa de função;
- Serviço extraordinário ou Folga compensatória.

**Resultado esperado:**
- cada assunto entra como um item separado;
- é possível editar e excluir itens já adicionados;
- assuntos do mesmo tipo aparecem agrupados sob um único título.

**Anotar:** foi fácil entender onde um assunto termina e o outro começa?

---

## Etapa 7 — Avisos de consistência institucional

**Ação:** provocar de propósito uma situação inconsistente, por exemplo:
- lançar férias e viagem do mesmo militar em datas que se cruzam; ou
- lançar apresentação sem o afastamento correspondente.

**Resultado esperado:** o sistema exibe um aviso explicando o conflito.

**Anotar:** o aviso está em linguagem compreensível? Você entenderia o que fazer sem ajuda?

---

## Etapa 8 — Avançar para a Conferência

**Ação:** clicar em **Ir para conferência** (Etapa 3).

**Resultado esperado:** aparece a lista completa dos itens, o cabeçalho institucional, as assinaturas e o Painel de Auditoria.

**Anotar:** a conferência mostra tudo que você precisa revisar antes de gerar?

---

## Etapa 9 — Interpretar bloqueios, alertas e sugestões

**Ação:** ler o Painel de Auditoria e classificar cada aviso encontrado:
- **Bloqueio** — impede gerar;
- **Alerta** — permite gerar, mas exige conferência;
- **Sugestão** — recomendação de documento complementar.

**Resultado esperado:** o botão de gerar fica desabilitado enquanto houver bloqueio; alertas e sugestões não impedem a geração.

**Anotar:** você conseguiu distinguir os três tipos sem explicação técnica?

---

## Etapa 10 — Salvar rascunho

**Ação:** clicar em **Salvar rascunho**.

**Resultado esperado:** confirmação de que o rascunho foi salvo; nenhum número é reservado nesse momento.

**Anotar:** ficou claro que salvar ≠ gerar?

---

## Etapa 11 — Sair e restaurar o rascunho

**Ação:** sair da tela (ou do sistema), voltar e abrir novamente o rascunho pelo Histórico.

**Resultado esperado:** todos os itens voltam exatamente como estavam, incluindo textos, datas e militares.

**Anotar:** faltou algum item? Algum campo voltou vazio?

---

## Etapa 12 — Gerar a NBI

**Ação:** clicar em **Gerar NBI** uma única vez e aguardar.

**Resultado esperado:**
- o número TESTE é atribuído;
- a tela informa a conclusão;
- não é gerado documento duplicado.

**Anotar:** quanto tempo demorou? Houve dúvida se o clique funcionou?

---

## Etapa 13 — Baixar o DOCX e conferir o documento

**Ação:** baixar o arquivo Word e conferir, página por página:
- cabeçalho institucional na primeira página;
- número e data corretos;
- todos os assuntos presentes, na ordem e agrupados;
- nenhum texto solto do tipo `{{...}}`;
- assinaturas juntas, sem ficarem sozinhas no fim da página;
- fonte e espaçamento iguais ao boletim oficial.

**Anotar:** você publicaria este documento no boletim do quartel sem editar nada no Word? Se não, o que precisaria mudar?

---

## Etapa 14 — Consultar a NBI no Histórico

**Ação:** abrir **NBI → Histórico** e localizar o documento recém-gerado.

**Resultado esperado:** o documento aparece no topo da lista, com número, data, status "gerado" e opção de baixar novamente.

**Anotar:** foi fácil encontrar? A ordem da lista faz sentido?

---

## Etapa 15 — Consultar Pendências NBI

**Ação:** abrir **NBI → Pendências**.

**Resultado esperado:** aparecem as pendências decorrentes do que foi lançado (por exemplo, apresentação pendente após férias, substituição em aberto, folga a compensar).

**Anotar:** as pendências correspondem à realidade do quartel? Falta alguma que você controla hoje no papel?

---

## Encerramento

Ao final, responda em poucas linhas:

1. Você conseguiria usar este módulo sozinho no dia a dia? (sim / com treinamento / não)
2. Qual etapa foi a mais confusa?
3. O que economizaria mais tempo se fosse automático?
4. Você confia no documento gerado o suficiente para publicá-lo?

---

## Formulário de Registro

Preencher uma linha por etapa. Também disponível em planilha (`formulario-teste-operador.csv`).

| # | Tempo de execução | Etapa | Ação realizada | Resultado esperado | Resultado encontrado | Dúvida do operador | Dificuldade encontrada | Erro encontrado | Severidade percebida | Observações | Sugestão do operador |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | Acessar o módulo NBI | | | | | | | | | |
| 2 | | Conferir dados institucionais | | | | | | | | | |
| 3 | | Iniciar Nova NBI | | | | | | | | | |
| 4 | | Assunto simples (Férias) | | | | | | | | | |
| 5 | | Interpretação por frase | | | | | | | | | |
| 6 | | Múltiplos assuntos | | | | | | | | | |
| 7 | | Avisos de consistência | | | | | | | | | |
| 8 | | Avançar para conferência | | | | | | | | | |
| 9 | | Bloqueios / alertas / sugestões | | | | | | | | | |
| 10 | | Salvar rascunho | | | | | | | | | |
| 11 | | Sair e restaurar rascunho | | | | | | | | | |
| 12 | | Gerar a NBI | | | | | | | | | |
| 13 | | Baixar o DOCX | | | | | | | | | |
| 14 | | Consultar Histórico | | | | | | | | | |
| 15 | | Consultar Pendências | | | | | | | | | |

**Identificação do teste**

- Operador: ____________________  Posto/Graduação: __________  Unidade: __________
- Data: ____/____/______  Início: ______  Término: ______
- Documento(s) gerado(s): TESTE ______ / ______
- Assinatura do operador: ______________________________
