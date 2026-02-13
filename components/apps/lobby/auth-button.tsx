"use client";

import { useCallback, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./use-lobby";

interface AuthButtonProps {
  user: User | null;
  profile: Profile | null;
  onSignInWithLinkedIn: () => Promise<{ error: string | null }>;
  onSignOut: () => void;
}

export function AuthButton({
  user,
  profile,
  onSignInWithLinkedIn,
  onSignOut,
}: AuthButtonProps) {
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLinkedInSignIn = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setErrorMessage(null);

    const { error } = await onSignInWithLinkedIn();
    setSending(false);

    if (error) {
      setErrorMessage(error);
    }
  }, [sending, onSignInWithLinkedIn]);

  if (!user) {
    return (
      <div className="w-full flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleLinkedInSignIn}
          disabled={sending}
          className="w-full h-9 px-3 rounded-md bg-[#0a66c2] hover:bg-[#0958a8]
            text-white text-[12px] font-semibold tracking-[0.01em] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <title>LinkedIn</title>
              <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.11 1 2.48 1h.02C3.87 1 4.98 2.12 4.98 3.5ZM.5 8h4V23h-4V8Zm7 0h3.84v2.05h.06c.54-1.02 1.86-2.1 3.82-2.1 4.08 0 4.83 2.69 4.83 6.18V23h-4v-7.75c0-1.85-.03-4.23-2.57-4.23-2.57 0-2.96 2.01-2.96 4.1V23h-4V8Z" />
            </svg>
            {sending ? "연결 중..." : "LinkedIn으로 로그인"}
          </span>
        </button>

        <p className="text-[10px] text-[#949ba4] px-1">로그인 후 채널에 메시지를 남길 수 있어요.</p>

        {errorMessage && (
          <span className="text-[10px] text-[#ff8e8e] px-1">{errorMessage}</span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex items-center gap-2">
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-[11px] text-white font-semibold">
          {profile?.display_name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
      )}

      <span className="text-xs text-[#b5bac1] truncate flex-1 min-w-0">
        {profile?.display_name ?? user.email}
      </span>

      <button
        type="button"
        onClick={onSignOut}
        className="text-[10px] text-[#b5bac1] hover:text-white transition-colors px-2 py-1 rounded hover:bg-[#383a40]"
      >
        로그아웃
      </button>
    </div>
  );
}
