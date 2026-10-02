# Correção da reserva manual na composição ORD

## Objetivo
Impedir que militares 24h deixados fora da composição ORD manual recebam qualquer escalação automática, preservando lançamentos explicitamente solicitados pelo operador e todo o comportamento sem composição manual.

## Implementação
- Reutilizar o identificador existente de militar fora da composição ORD manual nos candidatos de HE normal, HE forçada e reconciliação automática ORD→HE.
- Manter intactos lançamentos diretos informados pelo operador, virada selecionada e exceção obrigatória.
- Atualizar o aviso consolidado para informar que o militar não foi utilizado automaticamente e segue disponível para lançamento manual.
- Levar a mesma lista de nomes ao Relatório de Furos como observação informativa, sem alterar quantidade, classificação ou prioridade dos furos.
- Substituir e ampliar os testes da regra para os dez casos obrigatórios, sem enfraquecer a suíte existente.

## Validação
- Executar testes específicos, motor, XLSX, xlsx-surgical e suíte completa; verificar tipos e estado do preview.
- Repetir o cenário fictício 17/16 pelo fluxo real e auditar o XLSX, parando na primeira regressão.
- Não alterar dados reais, regras institucionais adjacentes, banco, permissões ou publicação.

## Detalhes técnicos
A mudança permanece localizada no motor de escala, no formato do detalhe salvo e na montagem do PDF de furos. O conjunto reservado será calculado uma vez pela definição existente e reutilizado; não será convertido em afastamento ou indisponibilidade.
