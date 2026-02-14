"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User, RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";

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
  sort_order?: number | null;
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

interface DirectMessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  sender: Profile | null;
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

function mapDirectMessage(row: DirectMessageRow): LobbyMessage {
  return {
    id: row.id,
    channelId: `dm:${row.receiver_id}`,
    userId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
    profile: {
      displayName: row.sender?.display_name ?? "Anonymous",
      avatarUrl: row.sender?.avatar_url ?? null,
    },
  };
}

export function useLobby() {
  const supabase = useMemo(() => createClient(), []);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const {
    user,
    loading: authLoading,
    authError: globalAuthError,
    signInWithLinkedIn,
    signOut,
  } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [dmProfiles, setDmProfiles] = useState<Profile[]>([]);
  const [dmAvailable, setDmAvailable] = useState(false);
  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<LobbyMessage[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dmMessagesLoading, setDmMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingDmMessage, setSendingDmMessage] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [dmSendError, setDmSendError] = useState<string | null>(null);

  const ensureProfile = useCallback(
    async (currentUser: User): Promise<Profile | null> => {
      const { data: existingProfile, error: existingError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (existingError) {
        setProfileError("프로필 정보를 불러오지 못했어요.");
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
        setProfileError("로그인은 되었지만 프로필 생성에 실패했어요.");
        return null;
      }

      setProfile(insertedProfile as Profile);
      return insertedProfile as Profile;
    },
    [supabase]
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileError(null);
      setDmProfiles([]);
      setActiveDmUserId(null);
      setDmMessages([]);
      setDmSendError(null);
      setDmAvailable(false);
      return;
    }

    ensureProfile(user).catch(() => {
      setProfileError("프로필 정보를 불러오지 못했어요.");
    });
  }, [user, ensureProfile]);

  useEffect(() => {
    if (!user) return;

    const checkDmAvailability = async () => {
      const { error } = await supabase.from("direct_messages").select("id").limit(1);

      if (error && error.code === "PGRST205") {
        setDmAvailable(false);
        setDmProfiles([]);
        setActiveDmUserId(null);
        return;
      }

      setDmAvailable(true);
    };

    checkDmAvailability();
  }, [supabase, user]);

  useEffect(() => {
    if (!user || !dmAvailable) return;

    const fetchDmProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", user.id)
        .order("created_at", { ascending: false })
        .limit(25);

      if (data) {
        setDmProfiles(data as Profile[]);
      }
    };

    fetchDmProfiles();
  }, [supabase, user, dmAvailable]);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const ordered = await supabase
          .from("channels")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (ordered.error && ordered.error.code === "42703") {
          const fallback = await supabase
            .from("channels")
            .select("*")
            .order("created_at", { ascending: true });

          if (!fallback.error && fallback.data) {
            setChannels(fallback.data as Channel[]);
            setActiveChannelId((prev) => prev ?? fallback.data[0]?.id ?? null);
          }
          return;
        }

        if (!ordered.error && ordered.data) {
          setChannels(ordered.data as Channel[]);
          setActiveChannelId((prev) => prev ?? ordered.data[0]?.id ?? null);
        }
      } finally {
        setChannelsLoading(false);
      }
    };

    fetchChannels();
  }, [supabase]);

  useEffect(() => {
    if (!activeChannelId) return;
    if (activeDmUserId) return;

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
  }, [activeChannelId, activeDmUserId, supabase]);

  useEffect(() => {
    if (!user || !activeDmUserId) return;

    let cancelled = false;

    const fetchDmMessages = async () => {
      setDmMessagesLoading(true);
      const other = activeDmUserId;
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*, sender:profiles!direct_messages_sender_id_fkey(display_name, avatar_url)")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (!cancelled) {
        if (!error && data) {
          setDmMessages((data as DirectMessageRow[]).map(mapDirectMessage));
        } else {
          setDmMessages([]);
        }
        setDmMessagesLoading(false);
      }
    };

    fetchDmMessages();

    return () => {
      cancelled = true;
    };
  }, [activeDmUserId, supabase, user]);

  useEffect(() => {
    if (!user) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

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
        supabase.realtime.setAuth(session.access_token);
      }

      let channel = supabase
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

      if (dmAvailable) {
        channel = channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
            filter: `receiver_id=eq.${user.id}`,
          },
          async (payload) => {
            const newRow = payload.new as {
              id: string;
              sender_id: string;
              receiver_id: string;
              content: string;
              created_at: string;
            };

            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", newRow.sender_id)
              .maybeSingle();

            const newMessage: LobbyMessage = {
              id: newRow.id,
              channelId: `dm:${newRow.receiver_id}`,
              userId: newRow.sender_id,
              content: newRow.content,
              createdAt: newRow.created_at,
              profile: {
                displayName: senderProfile?.display_name ?? "Anonymous",
                avatarUrl: senderProfile?.avatar_url ?? null,
              },
            };

            setDmMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              if (!activeDmUserId) return prev;
              if (
                newRow.sender_id !== activeDmUserId &&
                newRow.receiver_id !== activeDmUserId
              ) {
                return prev;
              }
              return [...prev, newMessage];
            });
          }
        );

        channel = channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
            filter: `sender_id=eq.${user.id}`,
          },
          async (payload) => {
            const newRow = payload.new as {
              id: string;
              sender_id: string;
              receiver_id: string;
              content: string;
              created_at: string;
            };

            const newMessage: LobbyMessage = {
              id: newRow.id,
              channelId: `dm:${newRow.receiver_id}`,
              userId: newRow.sender_id,
              content: newRow.content,
              createdAt: newRow.created_at,
              profile: {
                displayName: profile?.display_name ?? "Anonymous",
                avatarUrl: profile?.avatar_url ?? null,
              },
            };

            setDmMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              if (!activeDmUserId) return prev;
              if (
                newRow.sender_id !== activeDmUserId &&
                newRow.receiver_id !== activeDmUserId
              ) {
                return prev;
              }
              return [...prev, newMessage];
            });
          }
        );
      }

      channel = channel.subscribe();

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
  }, [supabase, user, activeDmUserId, dmAvailable, profile?.display_name, profile?.avatar_url]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !profile || !activeChannelId || !content.trim() || sendingMessage) return;
      if (activeDmUserId) return;

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
    [user, profile, activeChannelId, activeDmUserId, sendingMessage, supabase]
  );

  const sendDirectMessage = useCallback(
    async (content: string) => {
      if (!user || !profile || !activeDmUserId || !content.trim() || sendingDmMessage) return;

      setSendingDmMessage(true);
      setDmSendError(null);

      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: activeDmUserId,
        content: content.trim(),
      });

      if (error) {
        setDmSendError("DM 전송에 실패했어요. 다시 시도해 주세요.");
      }

      setSendingDmMessage(false);
    },
    [user, profile, activeDmUserId, sendingDmMessage, supabase]
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeDmProfile =
    activeDmUserId
      ? dmProfiles.find((p) => p.id === activeDmUserId) ?? null
      : null;

  const activeRoom: Channel | null = activeDmProfile
    ? {
        id: `dm:${activeDmProfile.id}`,
        name: `@${activeDmProfile.display_name}`,
        description: activeDmProfile.email,
        emoji: "💬",
        created_at: activeDmProfile.created_at,
      }
    : activeChannel;

  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);

  return {
    user,
    profile,
    loading: channelsLoading || authLoading,
    signInWithLinkedIn: () => signInWithLinkedIn({ nextPath: "/lobby" }),
    signOut,
    channels,
    activeChannel: activeRoom,
    activeChannelId,
    setActiveChannelId,
    dmProfiles,
    activeDmUserId,
    setActiveDmUserId,
    channelMessages,
    messagesLoading: activeDmUserId ? dmMessagesLoading : messagesLoading,
    sendMessage: activeDmUserId ? sendDirectMessage : sendMessage,
    sendingMessage: activeDmUserId ? sendingDmMessage : sendingMessage,
    authError: profileError ?? globalAuthError,
    sendError: activeDmUserId ? dmSendError : sendError,
    dmMessages,
  };
}
