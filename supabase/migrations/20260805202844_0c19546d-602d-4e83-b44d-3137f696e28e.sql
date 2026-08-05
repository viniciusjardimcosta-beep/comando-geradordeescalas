ALTER TABLE public.nbi_siglas_institucionais
  ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'sigla';