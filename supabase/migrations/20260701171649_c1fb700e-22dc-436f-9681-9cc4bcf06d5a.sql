ALTER TABLE public.escalas_geradas
ADD COLUMN IF NOT EXISTS furos jsonb NOT NULL DEFAULT '[]'::jsonb;