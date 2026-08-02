ALTER TABLE public.militares
  ADD COLUMN IF NOT EXISTS gbm_nbi text,
  ADD COLUMN IF NOT EXISTS companhia_nbi text,
  ADD COLUMN IF NOT EXISTS pelotao_nbi text,
  ADD COLUMN IF NOT EXISTS secao_nbi text,
  ADD COLUMN IF NOT EXISTS subsecao_nbi text,
  ADD COLUMN IF NOT EXISTS setor_nbi text,
  ADD COLUMN IF NOT EXISTS cidade_nbi text,
  ADD COLUMN IF NOT EXISTS batalhao_nbi text,
  ADD COLUMN IF NOT EXISTS funcao_administrativa_nbi text,
  ADD COLUMN IF NOT EXISTS funcao_documental_nbi text;