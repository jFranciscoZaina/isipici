-- No cambia tablas, relaciones ni credenciales existentes.
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
