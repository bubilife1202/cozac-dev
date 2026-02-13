"use client";

import { useState, useCallback } from "react";
import { useLobby } from "./use-lobby";
import { ChannelSidebar } from "./channel-sidebar";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";

interface LobbyViewProps {
  isMobile: boolean;
}

export function LobbyView({ isMobile }: LobbyViewProps) {
  const {
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
  } = useLobby();

  const [showChannelList, setShowChannelList] = useState(true);

  const handleSelectChannel = useCallback(
    (id: string) => {
      setActiveChannelId(id);
      if (isMobile) {
        setShowChannelList(false);
      }
    },
    [isMobile, setActiveChannelId]
  );

  const handleBack = useCallback(() => {
    setShowChannelList(true);
  }, []);

  if (loading) {
    return (
      <div className="h-full w-full bg-[#313338] flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[#5865f2] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="h-full w-full bg-[#313338] flex flex-col">
        {showChannelList ? (
          <ChannelSidebar
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={handleSelectChannel}
            user={user}
            profile={profile}
            onSignInWithLinkedIn={signInWithLinkedIn}
            onSignOut={signOut}
          />
        ) : (
          <>
            <div className="h-12 px-3 flex items-center gap-2 bg-[#313338] border-b border-[#232428] shadow-[0_1px_0_rgba(0,0,0,0.2)]">
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 rounded hover:bg-[#3f4147] text-[#b5bac1] hover:text-white transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <title>Back</title>
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-lg leading-none opacity-60">{activeChannel?.emoji ?? "#"}</span>
              <span className="text-white font-semibold text-[15px]">
                {activeChannel?.name}
              </span>
            </div>
            <MessageList
              messages={channelMessages}
              activeChannel={activeChannel}
              loading={messagesLoading}
            />
            {authError && (
              <div className="px-4 pb-1 text-xs text-[#ff8e8e]">{authError}</div>
            )}
            <MessageInput
              user={user}
              onSend={sendMessage}
              sending={sendingMessage}
              channelName={activeChannel?.name ?? ""}
              sendError={sendError}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-[#313338]">
      <div className="w-60 flex-shrink-0 h-full">
        <ChannelSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={handleSelectChannel}
          user={user}
          profile={profile}
          onSignInWithLinkedIn={signInWithLinkedIn}
          onSignOut={signOut}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 px-4 flex items-center gap-2 bg-[#313338] border-b border-[#232428] shadow-[0_1px_0_rgba(0,0,0,0.2)]">
          <span className="text-lg leading-none opacity-60">{activeChannel?.emoji ?? "#"}</span>
          <span className="text-white font-semibold text-[15px]">
            {activeChannel?.name}
          </span>
          {activeChannel?.description && (
            <>
              <div className="w-px h-6 bg-[#3f4147] mx-2" />
              <span className="text-sm text-[#949ba4] truncate">
                {activeChannel.description}
              </span>
            </>
          )}
        </div>

        <MessageList
          messages={channelMessages}
          activeChannel={activeChannel}
          loading={messagesLoading}
        />

        {authError && (
          <div className="px-4 pb-1 text-xs text-[#ff8e8e]">{authError}</div>
        )}

        <MessageInput
          user={user}
          onSend={sendMessage}
          sending={sendingMessage}
          channelName={activeChannel?.name ?? ""}
          sendError={sendError}
        />
      </div>
    </div>
  );
}
