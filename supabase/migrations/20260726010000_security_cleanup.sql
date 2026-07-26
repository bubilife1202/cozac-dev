-- Tighten the legacy public RPC surface after the remote schema was brought
-- under migration control. Public portfolio reads stay public; privileged
-- writes and trigger-only functions do not.

-- Pin SECURITY DEFINER lookup paths so caller-controlled schemas cannot shadow
-- the tables used by these functions. pg_temp is deliberately last.
ALTER FUNCTION public.delete_note(uuid, uuid)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.select_note(text)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.select_session_notes(uuid)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_note(uuid, uuid, text, text, text)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_note_content(uuid, uuid, text)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_note_emoji(uuid, uuid, text)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_note_title(uuid, uuid, text)
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.select_photos()
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.insert_photo(text, text, timestamp with time zone, text[])
    SET search_path TO public, pg_temp;
ALTER FUNCTION public.handle_new_user()
    SET search_path TO public, pg_temp;

-- Reading photos needs no elevated privileges because the table already has a
-- public SELECT policy. Photo insertion remains a server-only operation.
ALTER FUNCTION public.select_photos() SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.select_photos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_photos() TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.insert_photo(text, text, timestamp with time zone, text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_photo(text, text, timestamp with time zone, text[])
    TO service_role;

-- This function is invoked only by the auth.users trigger.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Notes intentionally use a random session UUID as their browser capability.
-- Make that public surface explicit instead of inheriting PostgreSQL's default
-- EXECUTE grant to PUBLIC.
REVOKE EXECUTE ON FUNCTION public.delete_note(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.select_note(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.select_session_notes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_note(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_note_content(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_note_emoji(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_note_title(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_note(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_note(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_session_notes(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_note(uuid, uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_note_content(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_note_emoji(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_note_title(uuid, uuid, text) TO anon, authenticated, service_role;

-- Uploads are accepted only by the protected Next.js route using service_role.
REVOKE INSERT ON public.photos FROM anon, authenticated;
DROP POLICY IF EXISTS "allow_insert_photos" ON public.photos;

-- Public buckets serve object URLs without a broad storage.objects SELECT
-- policy. Removing these policies prevents anonymous bucket listing.
DROP POLICY IF EXISTS "Public read access for note images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for photos" ON storage.objects;

-- Profiles are created by the auth trigger; direct client inserts are neither
-- granted nor needed by the private Lobby.
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
