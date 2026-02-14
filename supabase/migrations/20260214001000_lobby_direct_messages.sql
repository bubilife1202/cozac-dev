CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_created
  ON public.direct_messages (receiver_id, created_at);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_created
  ON public.direct_messages (sender_id, created_at);

CREATE POLICY "direct_messages_participants_read"
  ON public.direct_messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "direct_messages_sender_insert"
  ON public.direct_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "direct_messages_sender_delete"
  ON public.direct_messages
  FOR DELETE
  USING (auth.uid() = sender_id);

GRANT SELECT, INSERT, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
