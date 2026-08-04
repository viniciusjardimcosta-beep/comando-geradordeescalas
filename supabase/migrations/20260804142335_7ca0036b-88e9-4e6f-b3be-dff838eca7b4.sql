ALTER TABLE public.nbi_settings
  ADD COLUMN IF NOT EXISTS boletim_nome text,
  ADD COLUMN IF NOT EXISTS boletim_sigla text;