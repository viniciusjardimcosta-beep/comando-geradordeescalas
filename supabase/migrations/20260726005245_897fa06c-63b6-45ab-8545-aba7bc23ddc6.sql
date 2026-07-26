ALTER TABLE public.militares
  ADD COLUMN IF NOT EXISTS distribuicao_interna_nbi TEXT;

COMMENT ON COLUMN public.militares.distribuicao_interna_nbi
  IS 'Distribuição funcional interna para uso exclusivo do módulo NBI. Ex.: 2ºGBM/1ºPelBM/1ªCiaBM/12ºBBM IJUÍ. Não influencia o Gerador de Escalas.';