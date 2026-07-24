
ALTER TABLE public.nbi_settings
  ADD COLUMN IF NOT EXISTS digitador_posto_quadro TEXT,
  ADD COLUMN IF NOT EXISTS comandante_posto_quadro TEXT,
  ADD COLUMN IF NOT EXISTS autoridade_posto_quadro TEXT;
