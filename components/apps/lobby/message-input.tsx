"use client";

import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface MessageInputProps {
  user: User | null;
  onSend: (content: string) => void;
  onSignIn: (email: string) => Promise<{ error: unknown }>;
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
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSent, setLoginSent] = useState(false);
  const [loginSending, setLoginSending] = useState(false);

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

  const handleLogin = useCallback(async () => {
    if (!loginEmail.trim() || loginSending) return;
    setLoginSending(true);
    const { error } = await onSignIn(loginEmail.trim());
    setLoginSending(false);
    if (!error) setLoginSent(true);
  }, [loginEmail, loginSending, onSignIn]);

  if (!user) {
    if (loginSent) {
      return (
        <div className="px-4 pb-4 pt-2">
          <div className="bg-[#383a40] rounded-lg p-4 flex items-center justify-center gap-2">
            <svg viewBox="0 0 20 20" className="w-5 h-5 text-[#3ba55d]" fill="currentColor" aria-hidden="true">
              <title>Check</title>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-[#3ba55d]">
              로그인 링크를 보냈어요! 이메일을 확인하세요.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 pb-4 pt-2">
        <div className="bg-[#383a40] rounded-lg p-4 flex flex-col sm:flex-row items-center gap-3">
          <span className="text-sm text-[#949ba4] shrink-0">
            채팅에 참여하려면
          </span>
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              placeholder="이메일을 입력하세요"
              className="flex-1 bg-[#1e1f22] border border-[#3f4147] rounded-md px-3 py-2
                text-sm text-[#dbdee1] placeholder-[#6d6f78] outline-none
                focus:border-[#5865f2] transition-colors"
            />
            <button
              type="button"
              onClick={handleLogin}
              disabled={!loginEmail.trim() || loginSending}
              className="flex items-center gap-2 px-4 py-2 rounded-md shrink-0
                bg-[#5865f2] hover:bg-[#4752c4] active:bg-[#3c45a5]
                text-white text-sm font-medium transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginSending ? "전송 중..." : "로그인"}
            </button>
          </div>
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
