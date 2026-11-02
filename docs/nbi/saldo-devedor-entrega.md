# NBI — Saldo devedor: entrega controlada

## Resultado
Implementada a variante interna **Saldo devedor — recuperação prevista**, sem publicação. Não houve nova tabela, coluna, alteração de RLS ou mudança de RPC de numeração. A homologação final do operador permanece pendente de autorização.

## Arquivos e justificativas
- `src/lib/nbi/folgaCompensatoria.ts`: variante e validação numérica/semântica compartilhada; mês seguinte e ano válido.
- `src/lib/nbi/motores/folgaCompensatoria.ts`: reutilização da validação e placeholder `ANO_RECUPERACAO`.
- `src/lib/nbi/validarFolgaDocumento.ts`: checagem somente leitura dos campos persistidos; novas emissões com natureza explícita conferem cadastro atual, template, metadados e texto recomposto.
- `src/lib/nbi.functions.ts`: chamada antes de qualquer reserva, aplicação manual ou reutilização nos dois caminhos.
- `src/routes/app.nbi.nova.tsx`: seleção da natureza por variante, motivo de débito livre sem reformulação automática, prévia sem fallback de crédito e persistência dos metadados efetivos de Folga.
- `src/utils/nbi-categorias.ts`: template de débito interno, não um assunto independente.
- `src/lib/nbi/consistencia/pendencias.ts`: débito excluído de folgas positivas previstas.
- Três testes novos `saldoDevedor*.test.ts`, ajustes localizados em `bloco11b.test.ts` e `bloco12c.test.ts`: regras, servidor, coerência, duplicação e classificação.
- `vitest.config.ts`: testes isolados sem transformação RPC da aplicação, permitindo executar os handlers reais com clientes simulados.
- `AGENTS.md`, `roadmap.md` e memória: regras técnicas, andamento e decisões institucionais.

## Template criado no catálogo existente
Código: `folga_compensatoria_saldo_devedor`; subtipo: `saldo_devedor`. Adicionado somente esse registro, sem sobrescrever as duas redações anteriores. Campos do catálogo base reutilizados; ano da recuperação fornecido pelo motor.

> {{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, em virtude de ajustes no mapa por conta de {{MOTIVO}}, possui {{QTD_HORAS}} horas negativas, a serem compensadas referentes ao mês de {{MES_REFERENCIA}} de {{ANO}}, conforme mapa de escala de serviço executado. Há previsão de compensar estas horas no mês de {{MES_COMPENSACAO}} de {{ANO_RECUPERACAO}}.

O artigo é o mecanismo gramatical existente (O/A). O motivo é exclusivamente do operador.

## Validações
Quantidade inteira positiva e segura: rejeita vazio, zero, sinal negativo, decimais, booleanos, texto e números parcialmente válidos. Rejeita natureza incompatível, variante desconhecida, motivo ausente na previsão/débito e mês/ano inválidos. Débito exige `DEBITO`; modalidades positivas aceitam `CREDITO` ou ausência legada. Sem natureza, não se aplica a nova exigência de metadados/texto; os campos de Folga ainda são revalidados antes de novas emissões.

Nova emissão com natureza explícita rejeita divergências de `template_codigo`, `subtipo` e texto, inclusive texto antigo ou magnitude alterada depois da prévia. Nenhum histórico é reescrito.

## Evidências
- **520/520 testes aprovados**, 32 arquivos, com `bunx vitest run`.
- **55 novos casos específicos**: 30 regras, 16 handlers e 9 coerência; mais 1 novo caso no painel de Pendências.
- Cada caso inválido nos handlers verifica RPC não chamada, nenhuma escrita/acesso a storage e contador fictício preservado em **52**. Exercitados modos automático, manual e reutilização nos dois handlers.
- Compilação automática: `build OK`, estado consultado após as últimas alterações. Typecheck independente não foi executado; a verificação foi deixada ao mecanismo automático do projeto.
- Teste integrado na conta de homologação, militar fictício já existente **TESTE VICTOR DE HOMOLOGACAO**, matrícula **9000022**, nome de guerra **VICTOR**.
- NBI fictícia **012/2026** emitida pela interface, DOCX baixado e inspecionado. Trecho do DOCX coincide exatamente com a prévia: **75 horas negativas**, referência **dezembro/2026**, recuperação **janeiro/2027**; nenhum placeholder residual.
- Campos persistidos conferidos: `NATUREZA_SALDO=DEBITO`, `QTD_HORAS=75`, `SUBTIPO=saldo_devedor`, `template_codigo=folga_compensatoria_saldo_devedor`, metadado `subtipo=saldo_devedor`.
- Os 14 documentos anteriores de homologação conservaram exatamente os hashes de assuntos e snapshots antes/depois. Templates positivos conferidos e sem alteração.
- Só foi criada uma nova NBI fictícia; nenhum militar novo, documento real ou configuração operacional foi alterado.

## Limitações e próximo passo
Duplicação/recomposição e rejeição por chamada direta foram verificadas por testes isolados; não houve uma segunda emissão operacional via duplicação. A sugestão ortográfica existente ainda pode ser oferecida na conferência, mas não altera o motivo sem ação do operador. O novo campo de motivo usa texto livre sem capitalização/reformulação automática.

Homologação final e publicação aguardam autorização expressa. Não houve publicação.