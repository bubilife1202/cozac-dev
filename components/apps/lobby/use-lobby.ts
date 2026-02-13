"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

interface LobbyActionResult {
  error: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: Profile | null;
}

export interface LobbyMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  createdAt: string;
  profile: {
    displayName: string;
    avatarUrl: string | null;
  };
}

function mapMessage(row: MessageRow): LobbyMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    profile: {
      displayName: row.profiles?.display_name ?? "Anonymous",
      avatarUrl: row.profiles?.avatar_url ?? null,
    },
  };
}

export function useLobby() {
  const supabase = useMemo(() => createClient(), []);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const mapOAuthErrorMessage = useCallback(
    (message: string): string => {
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
    },
    []
  );

  const ensureProfile = useCallback(
    async (currentUser: User): Promise<Profile | null> => {
      const { data: existingProfile, error: existingError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (existingError) {
        setAuthError("프로필 정보를 불러오지 못했어요.");
        return null;
      }

      if (existingProfile) {
        setProfile(existingProfile as Profile);
        return existingProfile as Profile;
      }

      const displayName =
        (currentUser.user_metadata?.full_name as string | undefined) ||
        (currentUser.user_metadata?.name as string | undefined) ||
        currentUser.email?.split("@")[0] ||
        "guest";

      const avatarUrl =
        (currentUser.user_metadata?.avatar_url as string | undefined) ||
        (currentUser.user_metadata?.picture as string | undefined) ||
        null;

      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: currentUser.id,
            email: currentUser.email,
            display_name: displayName,
            avatar_url: avatarUrl,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();

      if (insertError) {
        setAuthError("로그인은 되었지만 프로필 생성에 실패했어요.");
        return null;
      }

      setProfile(insertedProfile as Profile);
      return insertedProfile as Profile;
    },
    [supabase]
  );

  useEffect(() => {
    let mounted = true;

    const loadingTimeout = window.setTimeout(() => {
      if (!mounted) return;
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
          setProfile(null);
          setAuthError(
            "세션을 확인하지 못했어요. 새로고침 후 다시 로그인해 주세요."
          );
          return;
        }

        setUser(session?.user ?? null);
        setAuthError(null);

        if (session?.user) {
          await ensureProfile(session.user);
        }
      } catch (error) {
        if (!mounted) return;
        setUser(null);
        setProfile(null);
        setAuthError(
          "세션을 확인하지 못했어요. 새로고침 후 다시 로그인해 주세요."
        );
      } finally {
        if (mounted) {
          window.clearTimeout(loadingTimeout);
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setUser(session?.user ?? null);
        setAuthError(null);
        if (session?.user) {
          await ensureProfile(session.user);
        } else {
          setProfile(null);
        }
      } catch (error) {
        setAuthError(
          "로그인 상태를 업데이트하지 못했어요. 새로고침 후 다시 시도해 주세요."
        );
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [supabase, ensureProfile]);

  const signInWithLinkedIn = useCallback(
    async (): Promise<LobbyActionResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
        },
      });

      if (error) {
        return { error: mapOAuthErrorMessage(error.message) };
      }

      return { error: null };
    },
    [supabase, mapOAuthErrorMessage]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase]);

  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data) {
        setChannels(data as Channel[]);
        setActiveChannelId((prev) => prev ?? data[0]?.id ?? null);
      }
    };

    fetchChannels();
  }, [supabase]);

  useEffect(() => {
    if (!activeChannelId) return;

    let cancelled = false;

    const fetchMessages = async () => {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*, profiles(display_name, avatar_url)")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true });

      if (!error && data && !cancelled) {
        setMessages((data as MessageRow[]).map(mapMessage));
      } else if (!cancelled) {
        setMessages([]);
      }
      if (!cancelled) {
        setMessagesLoading(false);
      }
    };

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [activeChannelId, supabase]);

  useEffect(() => {
    if (!user) return;

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    let mounted = true;

    const initRealtime = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      const channel = supabase
        .channel(`lobby-messages-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          async (payload) => {
            const newRow = payload.new as {
              id: string;
              channel_id: string;
              user_id: string;
              content: string;
              created_at: string;
            };

            const { data: profileData } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", newRow.user_id)
              .maybeSingle();

            const newMessage: LobbyMessage = {
              id: newRow.id,
              channelId: newRow.channel_id,
              userId: newRow.user_id,
              content: newRow.content,
              createdAt: newRow.created_at,
              profile: {
                displayName: profileData?.display_name ?? "Anonymous",
                avatarUrl: profileData?.avatar_url ?? null,
              },
            };

            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        )
        .subscribe();

      if (mounted) {
        realtimeChannelRef.current = channel;
      } else {
        supabase.removeChannel(channel);
      }
    };

    initRealtime();

    return () => {
      mounted = false;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [supabase, user]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !profile || !activeChannelId || !content.trim() || sendingMessage) return;

      setSendingMessage(true);
      setSendError(null);

      const { error } = await supabase.from("messages").insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: content.trim(),
      });

      if (error) {
        setSendError("메시지 전송에 실패했어요. 다시 시도해 주세요.");
      }

      setSendingMessage(false);
    },
    [user, profile, activeChannelId, sendingMessage, supabase]
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  const channelMessages = messages.filter(
    (m) => m.channelId === activeChannelId
  );

  return {
    user,
    profile,
    loading,
    signInWithLinkedIn,
    signOut,
    channels,
    activeChannel,
    activeChannelId,
    setActiveChannelId,
    channelMessages,
    messagesLoading,
    sendMessage,
    sendingMessage,
    authError,
    sendError,
  };
}
