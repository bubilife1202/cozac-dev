import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
// Relative rather than aliased so the node test runner, which compiles this
// file with a bare tsc invocation, can resolve it.
import { getSupabaseServiceEnv } from "../utils/supabase/config";

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  /** Namespace for the counter, e.g. "portfolio-chat". */
  bucket: string;
  /** Caller identity. Hashed before it leaves the process. */
  subject: string;
  limit: number;
  windowSeconds: number;
};

type MemoryEntry = {
  count: number;
  resetAt: number;
};

/**
 * Per-process counter.
 *
 * Used on its own for local development, where Supabase is frequently
 * unconfigured, and as the floor when the shared counter cannot be reached.
 * A serverless deployment runs many instances, so this alone cannot enforce a
 * global cap - {@link consumeRateLimit} is what production relies on.
 */
export function createInMemoryRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const entries = new Map<string, MemoryEntry>();

  return {
    consume(key: string): RateLimitDecision {
      const currentTime = now();
      const existing = entries.get(key);
      const entry =
        !existing || existing.resetAt <= currentTime
          ? { count: 0, resetAt: currentTime + windowMs }
          : existing;

      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000));

      if (entry.count >= limit) {
        return { allowed: false, retryAfterSeconds };
      }

      entry.count += 1;
      entries.set(key, entry);
      return { allowed: true, retryAfterSeconds };
    },
  };
}

export function hashRateLimitSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

function getServiceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Count a request against a window shared by every server instance.
 *
 * Returns null when no shared counter is reachable - either Supabase is not
 * configured, or the RPC failed. Callers decide what to do with that; the
 * portfolio chat route degrades to its per-process limiter.
 */
export async function consumeRateLimit({
  bucket,
  subject,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitDecision | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_subject: hashRateLimitSubject(subject),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    .single<{ allowed: boolean; retry_after_seconds: number }>();

  if (error || !data) {
    // Surface this loudly: a broken shared counter means the only thing
    // standing between a scraper and the provider quota is one instance's Map.
    console.error("Shared rate limit unavailable", {
      bucket,
      reason: error?.message ?? "empty response",
    });
    return null;
  }

  return {
    allowed: data.allowed,
    retryAfterSeconds: Math.max(1, data.retry_after_seconds),
  };
}
