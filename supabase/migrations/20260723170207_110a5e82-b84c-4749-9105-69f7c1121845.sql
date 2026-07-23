
-- FÉRIAS
UPDATE public.nbi_templates SET
  descricao = 'Concessão de férias regulamentares.',
  texto_modelo = 'Foi concedido a contar de {{DATA_INICIO}}, {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de Férias Regulamentares, relativas ao {{PERIODO}} período do ano de {{ANO}}, ao {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, devendo apresentar-se pronto para o serviço em {{DATA_APRESENTACAO}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data de início","tipo":"data","obrigatorio":true,"origem":"ferias_militares.data_inicio"},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","obrigatorio":true,"auto":"fim - inicio + 1"},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","obrigatorio":true,"auto":"extenso(QTD_DIAS)"},
    {"chave":"PERIODO","label":"Período (1º, 2º, 3º)","tipo":"texto","obrigatorio":true,"origem":"ferias_militares.periodo"},
    {"chave":"ANO","label":"Ano de referência","tipo":"inteiro","obrigatorio":true,"auto":"year(data_inicio)"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","obrigatorio":true,"origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","obrigatorio":true,"origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","obrigatorio":true,"origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","obrigatorio":true,"origem":"militares.lotacao_nbi"},
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","obrigatorio":true,"auto":"data_fim + 1"}
  ]'::jsonb,
  disponivel = true
WHERE codigo = 'ferias';

-- APRESENTAÇÃO
UPDATE public.nbi_templates SET
  descricao = 'Apresentação por conclusão de afastamento (férias, licença etc.).',
  texto_modelo = 'Em {{DATA_APRESENTACAO}}, apresentou-se por conclusão de {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de {{MOTIVO}}, relativas ao {{PERIODO}} período do ano de {{ANO}}, o {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}.',
  campos = '[
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","obrigatorio":true},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","obrigatorio":true,"auto":"extenso(QTD_DIAS)"},
    {"chave":"MOTIVO","label":"Motivo (ex.: Férias Regulamentares)","tipo":"texto","obrigatorio":true},
    {"chave":"PERIODO","label":"Período","tipo":"texto","obrigatorio":true},
    {"chave":"ANO","label":"Ano de referência","tipo":"inteiro","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","obrigatorio":true,"origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","obrigatorio":true,"origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","obrigatorio":true,"origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","obrigatorio":true,"origem":"militares.lotacao_nbi"}
  ]'::jsonb,
  disponivel = true
WHERE codigo = 'apresentacao';

-- VIAGEM
UPDATE public.nbi_templates SET
  descricao = 'Registro de viagem em missão.',
  texto_modelo = 'Em {{DATA_INICIO}}, o {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}} , viajou de {{ORIGEM}} para a Cidade de {{DESTINO}}, para exercer a seguinte missão: {{MISSAO}}, retornando em {{DATA_RETORNO}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data da viagem","tipo":"data","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","obrigatorio":true,"origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","obrigatorio":true,"origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","obrigatorio":true,"origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","obrigatorio":true,"origem":"militares.lotacao_nbi"},
    {"chave":"ORIGEM","label":"Cidade de origem","tipo":"texto","obrigatorio":true},
    {"chave":"DESTINO","label":"Cidade de destino","tipo":"texto","obrigatorio":true},
    {"chave":"MISSAO","label":"Missão","tipo":"texto_longo","obrigatorio":true},
    {"chave":"DATA_RETORNO","label":"Data de retorno","tipo":"data","obrigatorio":true}
  ]'::jsonb,
  disponivel = true
WHERE codigo = 'viagem';

-- ASSUNÇÃO DE FUNÇÃO
UPDATE public.nbi_templates SET
  descricao = 'Assunção cumulativa de função por afastamento do titular.',
  texto_modelo = 'A contar de {{DATA_INICIO}}, passou a responder pelas funções de {{FUNCAO_ASSUMIDA}}, cumulativamente com as funções que já exerce, o {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, visto o titular, encontrar-se em gozo de {{MOTIVO_TITULAR}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data de início","tipo":"data","obrigatorio":true},
    {"chave":"FUNCAO_ASSUMIDA","label":"Função assumida (posto + lotação)","tipo":"texto","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","obrigatorio":true,"origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","obrigatorio":true,"origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","obrigatorio":true,"origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","obrigatorio":true,"origem":"militares.lotacao_nbi"},
    {"chave":"MOTIVO_TITULAR","label":"Motivo do afastamento do titular","tipo":"texto","obrigatorio":true}
  ]'::jsonb,
  disponivel = true
WHERE codigo = 'assuncao_funcao';

-- DISPENSA DE FUNÇÃO
UPDATE public.nbi_templates SET
  descricao = 'Dispensa da função assumida em razão do retorno do titular.',
  texto_modelo = 'A contar de {{DATA_INICIO}}, deixou de responder pelas funções de {{FUNCAO_DISPENSADA}}, o {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}} "visto o titular o {{POSTO_QUADRO_TITULAR}} {{NOME_TITULAR}}, ID FUNC {{ID_FUNC_TITULAR}}, do {{LOTACAO_TITULAR}}, ter retornado de {{MOTIVO_RETORNO}}"',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data de dispensa","tipo":"data","obrigatorio":true},
    {"chave":"FUNCAO_DISPENSADA","label":"Função dispensada (posto + lotação)","tipo":"texto","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","obrigatorio":true,"origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","obrigatorio":true,"origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","obrigatorio":true,"origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","obrigatorio":true,"origem":"militares.lotacao_nbi"},
    {"chave":"POSTO_QUADRO_TITULAR","label":"Posto + Quadro do titular","tipo":"texto","obrigatorio":true},
    {"chave":"NOME_TITULAR","label":"Nome do titular","tipo":"texto","obrigatorio":true},
    {"chave":"ID_FUNC_TITULAR","label":"ID Func do titular","tipo":"texto","obrigatorio":true},
    {"chave":"LOTACAO_TITULAR","label":"Lotação do titular","tipo":"texto","obrigatorio":true},
    {"chave":"MOTIVO_RETORNO","label":"Motivo do retorno do titular","tipo":"texto","obrigatorio":true}
  ]'::jsonb,
  disponivel = true
WHERE codigo = 'dispensa_funcao';
