
-- NÚPCIAS (exemplar: NBI nº 28/2025; Modelo Oficial 2022)
INSERT INTO public.nbi_templates (codigo, titulo, titulo_documento, ordem, disponivel, estado_homologacao, subtipo, versao, campos, texto_modelo)
VALUES (
  'nupcias', 'Núpcias', 'NÚPCIAS', 16, true, 'homologado', NULL, 1,
  '[
    {"chave":"DATA_INICIO","label":"Data da concessão","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias (padrão institucional: 8)","tipo":"inteiro","default":8},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)"},
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","auto":"data_fim + 1"},
    {"chave":"ARTIGO_AO_A","label":"Artigo (ao/à)","tipo":"texto","auto":"genero(ao|à)","origem":"militares.genero_gramatical"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi"}
  ]'::jsonb,
  'Em {{DATA_INICIO}}, foi concedido {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de NÚPCIAS REGULAMENTAR, {{ARTIGO_AO_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, visto seu casamento, devendo apresentar-se pronto para o serviço em {{DATA_APRESENTACAO}}.'
)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, titulo_documento = EXCLUDED.titulo_documento,
  disponivel = EXCLUDED.disponivel, estado_homologacao = EXCLUDED.estado_homologacao,
  campos = EXCLUDED.campos, texto_modelo = EXCLUDED.texto_modelo;

-- LUTO (exemplar oficial anexado)
UPDATE public.nbi_templates SET
  titulo = 'Luto',
  titulo_documento = 'LUTO',
  disponivel = true,
  estado_homologacao = 'homologado',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data da concessão","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias (padrão institucional: 8)","tipo":"inteiro","default":8},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)"},
    {"chave":"MOTIVO_LUTO","label":"Falecimento de","tipo":"texto","obrigatorio":true},
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","auto":"data_fim + 1"},
    {"chave":"ARTIGO_AO_A","label":"Artigo (ao/à)","tipo":"texto","auto":"genero(ao|à)","origem":"militares.genero_gramatical"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi"}
  ]'::jsonb,
  texto_modelo = 'Em {{DATA_INICIO}}, foi concedido {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de LUTO REGULAMENTAR, {{ARTIGO_AO_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, visto Falecimento de {{MOTIVO_LUTO}}, devendo apresentar-se pronto para o serviço em {{DATA_APRESENTACAO}}.'
WHERE codigo = 'luto';

-- Variantes internas de APRESENTAÇÃO (nunca escolhidas diretamente no seletor)
INSERT INTO public.nbi_templates (codigo, titulo, titulo_documento, ordem, disponivel, estado_homologacao, subtipo, versao, campos, texto_modelo)
VALUES
(
  'apresentacao_nupcias', 'Apresentação após núpcias', 'APRESENTAÇÃO', 991, false, 'homologado', 'nupcias', 1,
  '[
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","obrigatorio":true},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)"},
    {"chave":"ARTIGO_O_A","label":"Artigo (o/a)","tipo":"texto","auto":"genero(o|a)"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto"}
  ]'::jsonb,
  'Em {{DATA_APRESENTACAO}}, apresentou-se por conclusão de {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de NÚPCIAS REGULAMENTAR, {{ARTIGO_O_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}.'
),
(
  'apresentacao_luto', 'Apresentação após luto', 'APRESENTAÇÃO', 992, false, 'homologado', 'luto', 1,
  '[
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","obrigatorio":true},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)"},
    {"chave":"ARTIGO_O_A","label":"Artigo (o/a)","tipo":"texto","auto":"genero(o|a)"},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto"},
    {"chave":"NOME","label":"Nome completo","tipo":"texto"},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto"},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto"}
  ]'::jsonb,
  'Em {{DATA_APRESENTACAO}}, apresentou-se por conclusão de {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias de LUTO REGULAMENTAR, {{ARTIGO_O_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}.'
),
(
  'apresentacao_paternidade', 'Apresentação após licença-paternidade', 'APRESENTAÇÃO', 993, false, 'aguardando_exemplar', 'licenca_paternidade', 1,
  '[]'::jsonb,
  ''
)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, titulo_documento = EXCLUDED.titulo_documento,
  disponivel = EXCLUDED.disponivel, estado_homologacao = EXCLUDED.estado_homologacao,
  subtipo = EXCLUDED.subtipo, campos = EXCLUDED.campos, texto_modelo = EXCLUDED.texto_modelo;
