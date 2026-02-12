"use client";

import type { Channel } from "./use-lobby";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./use-lobby";
import { AuthButton } from "./auth-button";

interface ChannelSidebarProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  user: User | null;
  profile: Profile | null;
  onSignIn: (email: string) => Promise<{ error: unknown }>;
  onSignOut: () => void;
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  onSelectChannel,
  user,
  profile,
  onSignIn,
  onSignOut,
}: ChannelSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-[#1e1f22]">
      <div className="h-12 px-4 flex items-center border-b border-[#1a1b1e] shadow-[0_1px_0_rgba(0,0,0,0.3)]">
        <h2 className="text-[15px] font-semibold text-white tracking-tight truncate">
          cozac.dev
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 px-2 space-y-0.5">
        <div className="px-2 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
            Channels
          </span>
        </div>
        {channels.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onSelectChannel(ch.id)}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors group ${
              activeChannelId === ch.id
                ? "bg-[#404249] text-white"
                : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
            }`}
          >
            <span className="text-lg leading-none opacity-60">{ch.emoji ?? "#"}</span>
            <span className="truncate font-medium">{ch.name}</span>
          </button>
        ))}
      </div>

      <div className="h-[52px] px-2 flex items-center bg-[#111214] border-t border-[#1a1b1e]">
        <AuthButton
          user={user}
          profile={profile}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      </div>
    </div>
  );
}
