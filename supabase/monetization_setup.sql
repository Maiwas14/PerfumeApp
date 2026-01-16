-- 1. EXTENSIÓN DE PERFILES PARA MONETIZACIÓN
-- Esta tabla se vincula directamente con auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  subscription_status TEXT DEFAULT 'free', -- 'free' o 'pro'
  scan_limit_daily INTEGER DEFAULT 3,      -- Límite para usuarios free
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en perfiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver su propio perfil"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- 2. TABLA DE LOGS DE USO
-- Para llevar la cuenta de cuántos escaneos lleva el usuario hoy
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL, -- 'scan' o 'expert_consult'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en logs
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propios logs"
ON public.usage_logs FOR SELECT
USING (auth.uid() = user_id);

-- 3. FUNCIÓN Y TRIGGER PARA CREAR PERFIL AUTOMÁTICO
-- Se ejecuta cuando un usuario se registra en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el trigger si ya existe para evitar errores al re-ejecutar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. VISTA PARA FACILITAR EL CONTEO DE ESCANEOS DIARIOS
CREATE OR REPLACE VIEW public.user_daily_usage AS
SELECT 
  user_id,
  action_type,
  COUNT(*) as count,
  CURRENT_DATE as usage_date
FROM public.usage_logs
WHERE created_at >= CURRENT_DATE
GROUP BY user_id, action_type;
