-- =============================================================================
-- Mello – kompletní setup nového Supabase projektu
-- Spusťte celý soubor v Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES – jméno, hlas, jazyk
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT 'vera',
  language TEXT NOT NULL DEFAULT 'cs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles: read own" ON public.profiles;
CREATE POLICY "Profiles: read own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: insert own" ON public.profiles;
CREATE POLICY "Profiles: insert own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: update own" ON public.profiles;
CREATE POLICY "Profiles: update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. CHAT_MESSAGES – historie rozhovoru
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages (conversation_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat: read own" ON public.chat_messages;
CREATE POLICY "Chat: read own"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Chat: insert own" ON public.chat_messages;
CREATE POLICY "Chat: insert own"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. SKILLS – tržiště dovedností (volitelná funkce)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('nabízím', 'hledám')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_created
  ON public.skills (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skills_type
  ON public.skills (type);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Skills: public read" ON public.skills;
CREATE POLICY "Skills: public read"
  ON public.skills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Skills: authenticated insert" ON public.skills;
CREATE POLICY "Skills: authenticated insert"
  ON public.skills FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 4. MELLO_MEMORY – rodinný deník (používá chat + stránka Deník)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mello_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'rodina',
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mello_memory_user_created
  ON public.mello_memory (user_id, created_at DESC);

ALTER TABLE public.mello_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Memory: read own" ON public.mello_memory;
CREATE POLICY "Memory: read own"
  ON public.mello_memory FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Memory: insert own" ON public.mello_memory;
CREATE POLICY "Memory: insert own"
  ON public.mello_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. TRIGGER – automaticky vytvoř prázdný profil po registraci
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, voice, language)
  VALUES (NEW.id, '', 'vera', 'cs')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. TRIGGER – updated_at u profilu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
