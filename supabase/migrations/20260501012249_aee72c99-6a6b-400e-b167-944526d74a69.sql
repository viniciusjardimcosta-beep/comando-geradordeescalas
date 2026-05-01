ALTER TABLE public.militares
ADD COLUMN tipo_escala text NOT NULL DEFAULT '24h'
CHECK (tipo_escala IN ('24h', 'parcial'));