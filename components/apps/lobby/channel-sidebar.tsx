"use client";

import type { Channel } from "./use-lobby";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./use-lobby";
import { WindowControls } from "@/components/window-controls";
import { useWindowFocus } from "@/lib/window-focus-context";
import { AuthButton } from "./auth-button";

interface ChannelSidebarProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  user: User | null;
  profile: Profile | null;
  onSignInWithLinkedIn: () => Promise<{ error: string | null }>;
  onSignOut: () => void;
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  onSelectChannel,
  user,
  profile,
  onSignInWithLinkedIn,
  onSignOut,
}: ChannelSidebarProps) {
  const windowFocus = useWindowFocus();
  const inShell = !!windowFocus;

  return (
    <div className="flex flex-col h-full bg-[#1e1f22]">
      <div
        className="h-12 px-4 flex items-center gap-2 border-b border-[#1a1b1e] shadow-[0_1px_0_rgba(0,0,0,0.3)] select-none relative"
      >
        {inShell && (
          <button
            type="button"
            aria-label="Drag window"
            className="absolute inset-0 cursor-default"
            onMouseDown={windowFocus?.onDragStart}
          />
        )}
        <WindowControls
          inShell={inShell}
          showWhenNotInShell={false}
          className="p-2 -ml-2 relative z-10"
          onClose={inShell ? windowFocus?.closeWindow : undefined}
          onMinimize={inShell ? windowFocus?.minimizeWindow : undefined}
          onToggleMaximize={inShell ? windowFocus?.toggleMaximize : undefined}
          isMaximized={windowFocus?.isMaximized ?? false}
        />
        <h2 className="text-[15px] font-semibold text-white tracking-tight truncate relative z-10">
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

      <div className="px-2 py-2 bg-[#111214] border-t border-[#1a1b1e]">
        <AuthButton
          user={user}
          profile={profile}
          onSignInWithLinkedIn={onSignInWithLinkedIn}
          onSignOut={onSignOut}
        />
      </div>
    </div>
  );
}
