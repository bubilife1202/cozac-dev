import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const lobbyMigration = readFileSync(
  `${root}/supabase/migrations/20260212000000_lobby.sql`,
  "utf8",
);

test("the lobby migration can be replayed over the manually provisioned remote schema", () => {
  const policyNames = [
    "profiles_public_read",
    "profiles_update_own",
    "channels_public_read",
    "messages_public_read",
    "messages_authenticated_insert",
    "messages_delete_own",
  ];

  for (const policyName of policyNames) {
    const dropAt = lobbyMigration.indexOf(`DROP POLICY IF EXISTS "${policyName}"`);
    const createAt = lobbyMigration.indexOf(`CREATE POLICY "${policyName}"`);

    assert.notEqual(dropAt, -1, `${policyName} must be dropped before it is recreated`);
    assert.ok(dropAt < createAt, `${policyName} must be dropped before CREATE POLICY`);
  }

  assert.match(
    lobbyMigration,
    /pg_publication_tables[\s\S]+ALTER PUBLICATION supabase_realtime ADD TABLE public\.messages/,
    "realtime publication membership must be checked before adding messages",
  );
});

test("the security cleanup keeps public reads while restricting privileged writes", () => {
  const path = `${root}/supabase/migrations/20260726010000_security_cleanup.sql`;
  assert.ok(existsSync(path), "a follow-up security migration must exist");

  const sql = readFileSync(path, "utf8");
  assert.match(sql, /ALTER FUNCTION public\.delete_note\([\s\S]+SET search_path TO public, pg_temp/);
  assert.match(sql, /ALTER FUNCTION public\.select_photos\(\) SECURITY INVOKER/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.insert_photo\([\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE INSERT ON public\.photos FROM anon, authenticated/);
  assert.match(sql, /DROP POLICY IF EXISTS "allow_insert_photos" ON public\.photos/);
  assert.match(sql, /DROP POLICY IF EXISTS "Public read access for note images" ON storage\.objects/);
  assert.match(sql, /DROP POLICY IF EXISTS "Public read access for photos" ON storage\.objects/);
  assert.match(sql, /DROP POLICY IF EXISTS "profiles_insert_own" ON public\.profiles/);
});
