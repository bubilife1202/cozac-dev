"use client";

import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface MessageInputProps {
  user: User | null;
  onSend: (content: string) => void;
  onSignIn: () => void;
  sending: boolean;
  channelName: string;
}

export function MessageInput({
  user,
  onSend,
  onSignIn,
  sending,
  channelName,
}: MessageInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(() => {
    if (!text.trim() || sending) return;
    onSend(text);
    setText("");
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (!user) {
    return (
      <div className="px-4 pb-4 pt-2">
        <div className="bg-[#383a40] rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-[#949ba4]">
            채팅에 참여하려면 로그인하세요
          </span>
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center gap-2 px-4 py-2 rounded-md
              bg-[#5865f2] hover:bg-[#4752c4] active:bg-[#3c45a5]
              text-white text-sm font-medium transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <title>Google</title>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="bg-[#383a40] rounded-lg flex items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`#${channelName}에 메시지 보내기`}
          rows={1}
          className="flex-1 bg-transparent text-[15px] text-[#dbdee1] placeholder-[#6d6f78]
            px-4 py-3 resize-none outline-none max-h-[200px] leading-[1.375rem]"
          style={{
            height: "auto",
            minHeight: "46px",
          }}
          onInput={(e) => {
            const target = e.currentTarget;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          className="p-3 text-[#b5bac1] hover:text-[#dbdee1] disabled:opacity-30
            disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="currentColor"
            aria-hidden="true"
          >
            <title>Send</title>
            <path d="M5.74 19.89a.5.5 0 0 1-.7-.6l1.8-6.79H12a.75.75 0 0 0 0-1.5H6.84L5.04 4.3a.5.5 0 0 1 .7-.6l14.5 7.5a.5.5 0 0 1 0 .88l-14.5 7.81Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
