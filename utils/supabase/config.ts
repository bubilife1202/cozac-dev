function normalizeEnvValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getSupabasePublicEnv() {
  return {
    url: normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function getSupabaseServiceEnv() {
  return {
    ...getSupabasePublicEnv(),
    serviceRoleKey: normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicEnv();
  return Boolean(url && anonKey);
}

export function isSupabaseServiceConfigured(): boolean {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  return Boolean(url && serviceRoleKey);
}
