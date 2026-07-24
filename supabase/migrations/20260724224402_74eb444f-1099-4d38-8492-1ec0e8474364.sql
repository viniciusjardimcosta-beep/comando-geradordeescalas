
ALTER TABLE public.nbi_settings
  ADD COLUMN IF NOT EXISTS cabecalho_estado text,
  ADD COLUMN IF NOT EXISTS cabecalho_secretaria text,
  ADD COLUMN IF NOT EXISTS cabecalho_corporacao text,
  ADD COLUMN IF NOT EXISTS cabecalho_batalhao text,
  ADD COLUMN IF NOT EXISTS cabecalho_subunidade text,
  ADD COLUMN IF NOT EXISTS cabecalho_cidade text;

-- Seed defaults conservadores só para linhas já existentes (não define batalhão nem subunidade)
UPDATE public.nbi_settings
  SET cabecalho_estado      = COALESCE(cabecalho_estado,      'ESTADO DO RIO GRANDE DO SUL'),
      cabecalho_secretaria  = COALESCE(cabecalho_secretaria,  'SECRETARIA DA SEGURANÇA PÚBLICA'),
      cabecalho_corporacao  = COALESCE(cabecalho_corporacao,  'CORPO DE BOMBEIROS MILITAR');

ALTER TABLE public.nbi_templates
  ADD COLUMN IF NOT EXISTS titulo_documento text;

UPDATE public.nbi_templates SET titulo_documento = 'FÉRIAS'                WHERE codigo = 'ferias';
UPDATE public.nbi_templates SET titulo_documento = 'APRESENTAÇÃO'          WHERE codigo = 'apresentacao';
UPDATE public.nbi_templates SET titulo_documento = 'VIAGEM'                 WHERE codigo = 'viagem';
UPDATE public.nbi_templates SET titulo_documento = 'ASSUNÇÃO DE FUNÇÃO'   WHERE codigo = 'assuncao_funcao';
UPDATE public.nbi_templates SET titulo_documento = 'DISPENSA DE FUNÇÃO'    WHERE codigo = 'dispensa_funcao';
UPDATE public.nbi_templates SET titulo_documento = 'SERVIÇO EXTRAORDINÁRIO' WHERE codigo = 'servico_extraordinario';
UPDATE public.nbi_templates SET titulo_documento = 'ASSUNÇÃO DE FUNÇÃO'   WHERE codigo = 'assuncao_cargo_vago';
UPDATE public.nbi_templates SET titulo_documento = 'DISPENSA DE FUNÇÃO'    WHERE codigo = 'dispensa_cargo_vago';
UPDATE public.nbi_templates SET titulo_documento = 'DISPENSA POR RECOMPENSA' WHERE codigo = 'dispensa_recompensa';
UPDATE public.nbi_templates SET titulo_documento = 'LICENÇA-PATERNIDADE'   WHERE codigo = 'licenca_paternidade';
UPDATE public.nbi_templates SET titulo_documento = 'LUTO'                   WHERE codigo = 'luto';
UPDATE public.nbi_templates SET titulo_documento = 'NOMEAÇÃO DE COMISSÃO' WHERE codigo = 'nomeacao_comissao';
UPDATE public.nbi_templates SET titulo_documento = 'RENOVAÇÃO DE TEMPO DE SERVIÇO' WHERE codigo = 'renovacao_tempo';
UPDATE public.nbi_templates SET titulo_documento = 'SITUAÇÃO SANITÁRIA'   WHERE codigo = 'situacao_sanitaria';
UPDATE public.nbi_templates SET titulo_documento = 'COMUNICADO'             WHERE codigo = 'comunicado';
