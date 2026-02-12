"use client";

import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./use-lobby";

interface AuthButtonProps {
  user: User | null;
  profile: Profile | null;
  onSignIn: (email: string) => Promise<{ error: string | null }>;
  onSignOut: () => void;
}

export function AuthButton({ user, profile, onSignIn, onSignOut }: AuthButtonProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSend = useCallback(async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setErrorMessage(null);
    const { error } = await onSignIn(email.trim());
    setSending(false);
    if (!error) {
      setSent(true);
    } else {
      setErrorMessage(error);
    }
  }, [email, sending, onSignIn]);

  if (!user) {
    if (sent) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#3ba55d]">
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
            <title>Check</title>
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          메일 확인하세요!
        </div>
      );
    }

    if (showInput) {
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
              if (e.key === "Escape") setShowInput(false);
            }}
            placeholder="이메일 입력"
            className="w-[140px] bg-[#1e1f22] border border-[#3f4147] rounded px-2 py-1
              text-xs text-[#dbdee1] placeholder-[#6d6f78] outline-none
              focus:border-[#5865f2] transition-colors"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!isValidEmail || sending}
            className="px-2 py-1 rounded bg-[#5865f2] hover:bg-[#4752c4]
              text-white text-[10px] font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "..." : "전송"}
          </button>
          {errorMessage && (
            <span className="text-[10px] text-[#ff8e8e]">{errorMessage}</span>
          )}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setShowInput(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md
          bg-[#4752c4] hover:bg-[#3c45a5] active:bg-[#343b8f]
          text-white text-xs font-medium transition-colors"
      >
        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
          <title>Email</title>
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
        로그인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="w-6 h-6 rounded-full"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center text-[10px] text-white font-semibold">
          {profile?.display_name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
      )}
      <span className="text-xs text-[#b5bac1] truncate max-w-[100px]">
        {profile?.display_name ?? user.email}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        className="text-[10px] text-[#b5bac1] hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-[#383a40]"
      >
        로그아웃
      </button>
    </div>
  );
}
