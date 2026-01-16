-- 1. TABLA MAESTRA DE PERFUMES
-- Aquí guardaremos los resultados de Gemini para que otros usuarios no tengan que pagar la consulta
CREATE TABLE IF NOT EXISTS public.master_perfumes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  notes JSONB,      -- Estructura: { top: [], heart: [], base: [] }
  usage JSONB,      -- Estructura: { season: [], occasions: [], day_night: "" }
  image_url TEXT,   -- URL de una imagen "canónica" o la primera que se subió
  full_ai_data JSONB, -- Backup de toda la respuesta de la IA
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Evitar duplicados exactos
  UNIQUE(brand, name)
);

-- Búsqueda por similitud de texto para el buscador
CREATE INDEX IF NOT EXISTS idx_perfumes_name_brand ON public.master_perfumes USING gin (to_tsvector('spanish', brand || ' ' || name));

-- 2. SEGURIDAD (RLS)
-- Cualquiera puede leer la tabla maestra para que el buscador funcione
ALTER TABLE public.master_perfumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de perfumes maestros"
ON public.master_perfumes FOR SELECT
TO authenticated, anon
USING (true);

-- Solo el sistema (Edge Functions) debería poder insertar aquí idealmente,
-- pero por ahora permitimos a usuarios autenticados para que la lógica de la App/Function funcione
CREATE POLICY "Insertar nuevos perfumes maestros"
ON public.master_perfumes FOR INSERT
TO authenticated
WITH CHECK (true);
