
-- Onda 2 dos motores NBI: redações oficiais extraídas dos exemplares homologados
-- (NBI 14/2026, 18/2026, 19/2025, 15/2026 e Modelos_textos_NBI_2022).

UPDATE public.nbi_templates SET
  titulo = 'Serviço extraordinário',
  titulo_documento = 'SERVIÇO EXTRAORDINÁRIO',
  disponivel = true,
  texto_modelo = '{{ARTIGO_O_A_CAP}} Militar Estadual {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, executou {{QTD_HORAS}} horas de serviço extraordinário no mês de {{MES_REFERENCIA}} de {{ANO}}, período de {{DATA_INICIO}} à {{DATA_FIM}}, na missão de {{MISSAO}}.',
  campos = '[
    {"chave":"QTD_HORAS","label":"Horas de serviço extraordinário","tipo":"inteiro","obrigatorio":true},
    {"chave":"MES_REFERENCIA","label":"Mês de referência","tipo":"texto","auto":"mes(DATA_INICIO)","obrigatorio":true},
    {"chave":"ANO","label":"Ano de referência","tipo":"inteiro","auto":"year(DATA_INICIO)","obrigatorio":true},
    {"chave":"DATA_INICIO","label":"Início do período","tipo":"data","obrigatorio":true},
    {"chave":"DATA_FIM","label":"Fim do período","tipo":"data","obrigatorio":true},
    {"chave":"MISSAO","label":"Missão executada","tipo":"texto_longo","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro","obrigatorio":true},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome","obrigatorio":true},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula","obrigatorio":true},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi","obrigatorio":true},
    {"chave":"ARTIGO_O_A_CAP","label":"Artigo (O/A)","tipo":"texto","auto":"genero(O|A)","origem":"militares.genero_gramatical","obrigatorio":true}
  ]'::jsonb
WHERE codigo = 'servico_extraordinario';

UPDATE public.nbi_templates SET
  titulo = 'Dispensa por recompensa',
  titulo_documento = 'DISPENSA POR RECOMPENSA',
  disponivel = true,
  texto_modelo = 'Foi concedido, a contar de {{DATA_INICIO}}, {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) {{TERMO_DIA}} de dispensa como recompensa pelos bons serviços prestados {{ARTIGO_AO_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, {{FUNCAO_DOCUMENTAL}}, conforme publicado no Boletim Interno nº {{BOLETIM_NUMERO}} de {{BOLETIM_DATA}} do {{BOLETIM_UNIDADE}}, devendo apresentar-se pronto para o serviço em {{DATA_APRESENTACAO}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data de início da dispensa","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","obrigatorio":true},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)","obrigatorio":true},
    {"chave":"TERMO_DIA","label":"dia/dias","tipo":"texto","auto":"plural(QTD_DIAS)","obrigatorio":true},
    {"chave":"BOLETIM_NUMERO","label":"Boletim Interno nº","tipo":"texto","obrigatorio":true},
    {"chave":"BOLETIM_DATA","label":"Data do Boletim Interno","tipo":"texto","obrigatorio":true},
    {"chave":"BOLETIM_UNIDADE","label":"Unidade do Boletim Interno","tipo":"texto","obrigatorio":true},
    {"chave":"com_apresentacao","label":"Há data de apresentação?","tipo":"boolean","default":true,"obrigatorio":false},
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","auto":"data_fim + 1","obrigatorio":false},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro","obrigatorio":true},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome","obrigatorio":true},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula","obrigatorio":true},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi","obrigatorio":true},
    {"chave":"FUNCAO_DOCUMENTAL","label":"Função documental","tipo":"texto","origem":"militares.funcao_documental_nbi","obrigatorio":true},
    {"chave":"ARTIGO_AO_A","label":"Artigo (ao/à)","tipo":"texto","auto":"genero(ao|à)","origem":"militares.genero_gramatical","obrigatorio":true}
  ]'::jsonb
WHERE codigo = 'dispensa_recompensa';

-- Variante oficial sem data de apresentação (redação distinta, jamais mesclada).
-- Fica indisponível no seletor: o motor a seleciona automaticamente.
INSERT INTO public.nbi_templates (codigo, titulo, titulo_documento, ordem, disponivel, descricao, texto_modelo, campos)
VALUES (
  'dispensa_recompensa_sem_apresentacao',
  'Dispensa por recompensa (sem apresentação)',
  'DISPENSA POR RECOMPENSA',
  999,
  false,
  'Variante oficial da dispensa por recompensa sem data de apresentação. Selecionada automaticamente pelo motor.',
  'Foi concedido em {{DATA_INICIO}}, {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) {{TERMO_DIA}} de dispensa por recompensa {{ARTIGO_AO_A}} {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, conforme publicado no Boletim Interno nº {{BOLETIM_NUMERO}} de {{BOLETIM_DATA}} do {{BOLETIM_UNIDADE}}.',
  '[]'::jsonb
)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  titulo_documento = EXCLUDED.titulo_documento,
  disponivel = false,
  texto_modelo = EXCLUDED.texto_modelo;

UPDATE public.nbi_templates SET
  titulo = 'Nomeação de comissão',
  titulo_documento = 'NOMEAÇÃO DE COMISSÃO',
  disponivel = true,
  texto_modelo = 'Em {{DATA_INICIO}}, nomeio a Comissão composta pelo {{COMPOSICAO}}, para sob a Presidência do Primeiro e os demais como Membros, comporem comissão {{FINALIDADE}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data da nomeação","tipo":"data","obrigatorio":true},
    {"chave":"COMPOSICAO","label":"Composição da comissão (presidente e membros, com ID Func / CPF / RG)","tipo":"texto_longo","obrigatorio":true},
    {"chave":"FINALIDADE","label":"Finalidade da comissão (iniciar com \"para ...\")","tipo":"texto_longo","obrigatorio":true}
  ]'::jsonb
WHERE codigo = 'nomeacao_comissao';

UPDATE public.nbi_templates SET
  titulo = 'Licença-paternidade',
  titulo_documento = 'LICENÇA PATERNIDADE',
  disponivel = true,
  texto_modelo = 'Em {{DATA_INICIO}} entrou em gozo de Licença Paternidade por {{QTD_DIAS}} ({{QTD_DIAS_EXTENSO}}) dias, o {{POSTO_QUADRO}} {{NOME}}, ID FUNC {{ID_FUNC}}, do {{LOTACAO}}, devendo apresentar-se pronto para o serviço em {{DATA_APRESENTACAO}}.',
  campos = '[
    {"chave":"DATA_INICIO","label":"Data de início da licença","tipo":"data","obrigatorio":true},
    {"chave":"QTD_DIAS","label":"Quantidade de dias","tipo":"inteiro","default":30,"obrigatorio":true},
    {"chave":"QTD_DIAS_EXTENSO","label":"Quantidade por extenso","tipo":"texto","auto":"extenso(QTD_DIAS)","obrigatorio":true},
    {"chave":"DATA_APRESENTACAO","label":"Data de apresentação","tipo":"data","auto":"data_fim + 1","obrigatorio":true},
    {"chave":"POSTO_QUADRO","label":"Posto + Quadro","tipo":"texto","origem":"militares.posto_graduacao + militares.quadro","obrigatorio":true},
    {"chave":"NOME","label":"Nome completo","tipo":"texto","origem":"militares.nome","obrigatorio":true},
    {"chave":"ID_FUNC","label":"ID Func / Matrícula","tipo":"texto","origem":"militares.matricula","obrigatorio":true},
    {"chave":"LOTACAO","label":"Lotação","tipo":"texto","origem":"militares.lotacao_nbi","obrigatorio":true}
  ]'::jsonb
WHERE codigo = 'licenca_paternidade';
