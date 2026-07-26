-- Private Lobby: the lobby stops being a public community feed and becomes a
-- write-only inbox. Visitors (including anonymous guests) may insert a message
-- for cozac; nobody but service_role can read messages or profiles back.

-- ============================================================
-- 1. Remove every public read path
-- ============================================================
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "messages_public_read" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;

REVOKE ALL PRIVILEGES ON public.profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.messages FROM anon, authenticated;

GRANT SELECT ON public.channels TO anon, authenticated;
GRANT INSERT ON public.messages TO authenticated;
GRANT ALL PRIVILEGES ON public.profiles TO service_role;
GRANT ALL PRIVILEGES ON public.messages TO service_role;

-- Re-create the insert policy with a scalar auth.uid() subquery so Postgres
-- evaluates it once per statement instead of once per row.
DROP POLICY IF EXISTS "messages_authenticated_insert" ON public.messages;
CREATE POLICY "messages_authenticated_insert" ON public.messages
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

-- ============================================================
-- 2. Anonymous guests must still get a profile row
-- ============================================================
-- messages.user_id references profiles(id), so the signup trigger has to
-- succeed for anonymous sign-ins too. Anonymous users have no email, which made
-- the previous split_part(NEW.email, '@', 1) fallback evaluate to NULL.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            'Guest'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        )
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);
    RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Retire direct messages
-- ============================================================
-- The private lobby has no DM surface. Keep the rows, drop client access.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'direct_messages'
    ) THEN
        DROP POLICY IF EXISTS "direct_messages_participants_read" ON public.direct_messages;
        DROP POLICY IF EXISTS "direct_messages_sender_insert" ON public.direct_messages;
        DROP POLICY IF EXISTS "direct_messages_sender_delete" ON public.direct_messages;
        REVOKE ALL PRIVILEGES ON public.direct_messages FROM anon, authenticated;
        GRANT ALL PRIVILEGES ON public.direct_messages TO service_role;
    END IF;
END;
$$;

-- ============================================================
-- 4. Curate the topic list
-- ============================================================
-- Channels from the community-feed era (hiring / looking / til / activity) no
-- longer make sense as "topics for a private note to cozac". Hide them instead
-- of deleting: messages cascade on channel delete.
ALTER TABLE public.channels
    ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.channels
SET visible = FALSE
WHERE name IN ('hiring', 'looking', 'til', 'activity');

UPDATE public.channels
SET
    visible = TRUE,
    description = CASE name
        WHEN 'general' THEN '무엇이든 편하게 남겨주세요'
        WHEN 'introductions' THEN '간단한 소개를 남겨주세요'
        WHEN 'projects' THEN '프로젝트와 협업 이야기를 남겨주세요'
    END,
    sort_order = CASE name
        WHEN 'general' THEN 10
        WHEN 'introductions' THEN 20
        WHEN 'projects' THEN 30
    END
WHERE name IN ('general', 'introductions', 'projects');

-- ============================================================
-- 5. Bound message size and stop broadcasting
-- ============================================================
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_content_length;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_content_length
    CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'direct_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.direct_messages;
    END IF;
END;
$$;
