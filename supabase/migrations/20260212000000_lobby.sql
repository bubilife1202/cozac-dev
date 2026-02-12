-- Lobby: Discord/Slack-like community feature
-- profiles, channels, messages with Google OAuth

-- Profiles table (auto-synced from auth.users via trigger)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on Google OAuth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Channels table
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    emoji TEXT DEFAULT '#',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON public.messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON public.messages(channel_id, created_at);

-- RLS: Profiles
CREATE POLICY "profiles_public_read" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- RLS: Channels (anyone can read)
CREATE POLICY "channels_public_read" ON public.channels
    FOR SELECT USING (true);

-- RLS: Messages
CREATE POLICY "messages_public_read" ON public.messages
    FOR SELECT USING (true);

CREATE POLICY "messages_authenticated_insert" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "messages_delete_own" ON public.messages
    FOR DELETE USING (auth.uid() = user_id);

-- Grants: anon (read-only)
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.channels TO anon;
GRANT SELECT ON public.messages TO anon;

-- Grants: authenticated (read + write)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.channels TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;

-- Grants: service_role (full)
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.channels TO service_role;
GRANT ALL ON public.messages TO service_role;

-- Default channels
INSERT INTO public.channels (name, description, emoji) VALUES
    ('general', '자유롭게 대화하세요 💬', '💬'),
    ('introductions', '자기소개를 해주세요 👋', '👋'),
    ('projects', '프로젝트를 공유해주세요 🚀', '🚀')
ON CONFLICT (name) DO NOTHING;

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
