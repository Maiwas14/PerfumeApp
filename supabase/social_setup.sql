-- 1. SOLUCIÓN AL PROBLEMA DE "NO SE VE NADA":
-- Esta política permite que TODOS los usuarios registrados puedan ver 
-- las colecciones de otros. Sin esto, el "Foro de Reseñas" siempre estará vacío 
-- porque Supabase bloquea ver datos ajenos por defecto.

CREATE POLICY "Ver Reseñas Publicas"
ON public.user_collections
FOR SELECT
TO authenticated
USING (true);


-- 2. TABLA PARA LOS "LIKES" (Me Gusta):
-- Para que el botón de corazón funcione y guarde los likes en la base de datos.

CREATE TABLE IF NOT EXISTS public.likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  collection_id UUID REFERENCES public.user_collections(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, collection_id) -- Evita que alguien de like 2 veces al mismo perfume
);

-- Activar seguridad en la tabla Likes
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Permisos para Likes
CREATE POLICY "Ver todos los likes" 
ON public.likes FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Dar like" 
ON public.likes FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Quitar like" 
ON public.likes FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);
