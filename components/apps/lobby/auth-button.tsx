"use client";

import type { User } from "@supabase/supabase-js";
import type { Profile } from "./use-lobby";

interface AuthButtonProps {
  user: User | null;
  profile: Profile | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AuthButton({ user, profile, onSignIn, onSignOut }: AuthButtonProps) {
  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md
          bg-[#4752c4] hover:bg-[#3c45a5] active:bg-[#343b8f]
          text-white text-xs font-medium transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true"><title>Google</title>
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Google로 로그인
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
