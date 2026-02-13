"use client";

import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface MessageInputProps {
  user: User | null;
  onSend: (content: string) => void;
  sending: boolean;
  channelName: string;
  sendError?: string | null;
}

export function MessageInput({
  user,
  onSend,
  sending,
  channelName,
  sendError,
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
        <div className="bg-[#383a40] rounded-lg flex items-end opacity-80">
          <textarea
            value=""
            disabled
            placeholder="메시지를 보내려면 LinkedIn으로 로그인하세요 (좌측 하단)"
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-[#dbdee1] placeholder-[#6d6f78]
              px-4 py-3 resize-none outline-none leading-[1.375rem] cursor-not-allowed"
            style={{
              height: "auto",
              minHeight: "46px",
            }}
          />
          <button
            type="button"
            disabled
            className="p-3 text-[#b5bac1] opacity-30 cursor-not-allowed transition-colors flex-shrink-0"
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

  return (
    <div className="px-4 pb-4 pt-2">
      {sendError && (
        <div className="mb-2 text-xs text-[#ff8e8e]">{sendError}</div>
      )}
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
