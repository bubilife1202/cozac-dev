"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getOptionalClient } from "@/utils/supabase/client";

interface AuthActionResult {
  error: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signInWithLinkedIn: (options?: { nextPath?: string }) => Promise<AuthActionResult>;
  signInAnonymously: () => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getSafeNextPath(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function mapOAuthErrorMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("provider is not enabled") ||
    lowerMessage.includes("unsupported provider") ||
    lowerMessage.includes("oauth_provider_not_supported") ||
    lowerMessage.includes("missing oauth")
  ) {
    return "LinkedIn 로그인이 아직 설정되지 않았어요. 관리자 설정이 필요해요.";
  }

  return "LinkedIn 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getOptionalClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setUser(null);
      setAuthError(null);
      setLoading(false);
      return;
    }

    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let mounted = true;

    const loadingTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setUser(null);
      setAuthError(
        "세션 초기화가 지연되고 있어요. 새로고침 후 다시 로그인해 주세요."
      );
      setLoading(false);
    }, 10000);

    const init = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          setUser(null);
          setAuthError(
            "세션을 확인하지 못했어요. 새로고침 후 다시 로그인해 주세요."
          );
          setLoading(false);
          return;
        }

        setUser(session?.user ?? null);
        setAuthError(null);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setUser(null);
        setAuthError(
          "세션을 확인하지 못했어요. 새로고침 후 다시 로그인해 주세요."
        );
        setLoading(false);
      } finally {
        if (mounted) {
          window.clearTimeout(loadingTimeout);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthError(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithLinkedIn = useCallback(
    async (options?: { nextPath?: string }): Promise<AuthActionResult> => {
      if (!supabase) {
        const message =
          "로그인이 잠시 비활성화되어 있어요. 저장소 복구 후 다시 사용할 수 있어요.";
        setAuthError(message);
        return { error: message };
      }

      setAuthError(null);
      const nextPath = getSafeNextPath(options?.nextPath);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: {
          redirectTo,
        },
      });

      if (error) {
        const message = mapOAuthErrorMessage(error.message);
        setAuthError(message);
        return { error: message };
      }

      return { error: null };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const signInAnonymously = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) {
      const message = "로그인이 잠시 비활성화되어 있어요.";
      setAuthError(message);
      return { error: message };
    }

    setAuthError(null);
    const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { full_name: `Guest ${suffix}` } },
    });

    if (error) {
      const message = "게스트 참여에 실패했어요. 잠시 후 다시 시도해 주세요.";
      setAuthError(message);
      return { error: message };
    }

    return { error: null };
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{ user, loading, authError, signInWithLinkedIn, signInAnonymously, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
