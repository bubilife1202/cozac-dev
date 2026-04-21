-- Security hardening: fix 3 vulnerabilities flagged by Supabase Security Advisor

-- ============================================================
-- 1. notes: revoke excessive grants from anon (keep SELECT only)
-- ============================================================
REVOKE DELETE, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES ON "public"."notes" FROM anon;

-- ============================================================
-- 2. photos: restrict INSERT to authenticated only
-- ============================================================
REVOKE INSERT ON "public"."photos" FROM anon;

DROP POLICY IF EXISTS "allow_insert_photos" ON "public"."photos";
CREATE POLICY "allow_insert_photos"
ON "public"."photos"
AS permissive
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- 3. storage: tighten upload/delete policies
-- ============================================================

-- note-images: restrict uploads to authenticated users
DROP POLICY IF EXISTS "Allow users to upload note images" ON storage.objects;
CREATE POLICY "Allow users to upload note images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'note-images');

-- note-images: only allow owners to delete their own files
DROP POLICY IF EXISTS "Allow users to delete their own note images" ON storage.objects;
CREATE POLICY "Allow users to delete their own note images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- photos: restrict uploads to authenticated users
DROP POLICY IF EXISTS "Allow uploads to photos bucket" ON storage.objects;
CREATE POLICY "Allow uploads to photos bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photos');
