import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./config";

export function getOptionalClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) {
    return null;
  }

  return createBrowserClient(url, anonKey);
}

export function createClient() {
  const client = getOptionalClient();
  if (!client) {
    throw new Error("Supabase URL and Key are required");
  }

  return client;
}
