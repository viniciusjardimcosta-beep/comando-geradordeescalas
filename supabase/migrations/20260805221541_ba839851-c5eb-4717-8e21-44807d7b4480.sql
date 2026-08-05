INSERT INTO public.nbi_templates (codigo, titulo, titulo_documento, ordem, disponivel, estado_homologacao, subtipo, versao, descricao, campos, texto_modelo)
VALUES
(
  'folga_compensatoria',
  'Folga compensatória',
  'FOLGA COMPENSATÓRIA',
  20,
  true,
  'homologado',
  'previsao',
  1,
  'Horas pendentes a serem compensadas, com previsão de compensação no mês seguinte.',
  '[
    {"chave":"mes_referencia_sel","label":"Mês de referência","tipo":"mes","obrigatorio":true},
    {"chave":"QTD_HORAS","label":"Quantidade de horas","tipo":"inteiro","obrigatorio":true},
    {"chave":"MOTIVO","label":"Motivo","tipo":"texto","obrigatorio":true},
    {"chave":"MES_REFERENCIA","label":"Mês de referência (extenso)","tipo":"texto","auto":"mes(mes_referencia_sel)"},
    {"chave":"MES_COMPENSACAO","label":"Mês previsto para compensação","tipo":"texto","auto":"mes_seguinte(mes_referencia_sel)"},
    {"chave":"ANO","label":"Ano de referência","tipo":"texto","auto":"year(mes_referencia_sel)"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi"},
    {"chave":"ARTIGO_O_A_CAP","label":"Artigo (O/A)","tipo":"texto","auto":"genero(O|A)","origem":"militares.genero_gramatical"}
  ]'::jsonb,
  '{{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, em virtude de {{MOTIVO}}, possui {{QTD_HORAS}} horas a serem compensadas referentes ao mês de {{MES_REFERENCIA}}, conforme mapa de escala de serviço executado. Há previsão de compensar estas horas no mês de {{MES_COMPENSACAO}}.'
),
(
  'folga_compensatoria_realizada',
  'Folga compensatória (compensação realizada)',
  'FOLGA COMPENSATÓRIA',
  21,
  true,
  'homologado',
  'realizada',
  1,
  'Variante interna: horas pendentes já compensadas no mês seguinte.',
  '[
    {"chave":"mes_referencia_sel","label":"Mês de referência","tipo":"mes","obrigatorio":true},
    {"chave":"QTD_HORAS","label":"Quantidade de horas","tipo":"inteiro","obrigatorio":true},
    {"chave":"MES_REFERENCIA","label":"Mês de referência (extenso)","tipo":"texto","auto":"mes(mes_referencia_sel)"},
    {"chave":"MES_COMPENSACAO","label":"Mês da compensação","tipo":"texto","auto":"mes_seguinte(mes_referencia_sel)"},
    {"chave":"ANO","label":"Ano de referência","tipo":"texto","auto":"year(mes_referencia_sel)"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi"},
    {"chave":"ARTIGO_O_A_CAP","label":"Artigo (O/A)","tipo":"texto","auto":"genero(O|A)","origem":"militares.genero_gramatical"}
  ]'::jsonb,
  '{{ARTIGO_O_A_CAP}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, compensou, no mês de {{MES_COMPENSACAO}}, {{QTD_HORAS}} horas de serviço pendentes referentes ao mês de {{MES_REFERENCIA}} de {{ANO}}, conforme mapa de escala de serviço executado naquele mês.'
)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  titulo_documento = EXCLUDED.titulo_documento,
  ordem = EXCLUDED.ordem,
  disponivel = EXCLUDED.disponivel,
  estado_homologacao = EXCLUDED.estado_homologacao,
  subtipo = EXCLUDED.subtipo,
  versao = EXCLUDED.versao,
  descricao = EXCLUDED.descricao,
  campos = EXCLUDED.campos,
  texto_modelo = EXCLUDED.texto_modelo;