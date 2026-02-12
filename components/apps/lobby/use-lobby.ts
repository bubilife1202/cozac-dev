"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
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

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (data) {
        setProfile(data as Profile);
      }
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signIn = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + "/lobby",
        },
      });
      return { error };
    },
    [supabase]
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
        if (data.length > 0 && !activeChannelId) {
          setActiveChannelId(data[0].id);
        }
      }
    };

    fetchChannels();
  }, [supabase, activeChannelId]);

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
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel("lobby-messages")
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
            .single();

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

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !activeChannelId || !content.trim() || sendingMessage) return;

      setSendingMessage(true);

      const { error } = await supabase.from("messages").insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: content.trim(),
      });

      if (error) {
        console.error("Failed to send message:", error);
      }

      setSendingMessage(false);
    },
    [user, activeChannelId, sendingMessage, supabase]
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  const channelMessages = messages.filter(
    (m) => m.channelId === activeChannelId
  );

  return {
    user,
    profile,
    loading,
    signIn,
    signOut,
    channels,
    activeChannel,
    activeChannelId,
    setActiveChannelId,
    channelMessages,
    messagesLoading,
    sendMessage,
    sendingMessage,
  };
}
