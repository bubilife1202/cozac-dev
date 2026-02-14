"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSystemSettings } from "@/lib/system-settings-context";
import { getWallpaperPath } from "@/lib/os-versions";
import { useAuth } from "@/lib/auth-context";

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { currentOS } = useSystemSettings();
  const { user, loading: authLoading, authError, signInWithLinkedIn } = useAuth();
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      // Time in format "6:24" (no leading zero, no AM/PM)
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const displayHours = hours % 12 || 12;
      setCurrentTime(`${displayHours}:${minutes}`);

      // Date in format "Wed Jan 7"
      const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
      const month = now.toLocaleDateString("en-US", { month: "short" });
      const day = now.getDate();
      setCurrentDate(`${weekday} ${month} ${day}`);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const displayName = useMemo(() => {
    const fromMeta =
      (user?.user_metadata?.full_name as string | undefined) ||
      (user?.user_metadata?.name as string | undefined);
    if (fromMeta) return fromMeta;
    return user?.email?.split("@")[0] || "cozac";
  }, [user]);

  const avatarUrl = useMemo(() => {
    return (
      (user?.user_metadata?.avatar_url as string | undefined) ||
      (user?.user_metadata?.picture as string | undefined) ||
      null
    );
  }, [user]);

  const handleUnlock = useCallback(() => {
    setIsUnlocking(true);
    window.setTimeout(() => {
      onUnlock();
    }, 300);
  }, [onUnlock]);

  const handleLinkedInSignIn = useCallback(async () => {
    if (sending || authLoading) return;
    setSending(true);
    setLocalError(null);

    const { error } = await signInWithLinkedIn({ nextPath: "/lobby" });
    setSending(false);
    if (error) {
      setLocalError(error);
    }
  }, [sending, authLoading, signInWithLinkedIn]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center transition-opacity duration-300 bg-black ${
        isUnlocking ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Wallpaper background (not blurred) - covers everything */}
      <div className="absolute inset-0">
        <Image
          src={getWallpaperPath(currentOS.id)}
          alt="Lock screen wallpaper"
          fill
          className="object-cover"
          priority
          quality={90}
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Date and Time - positioned near top */}
      <div className="mt-24 text-center relative z-10">
        <div
          className="text-2xl font-medium text-white/80 tracking-wide"
          style={{ textShadow: "0 0 20px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2)" }}
        >
          {currentDate}
        </div>
        <div
          className="text-[120px] text-white/70 leading-none tracking-tight"
          style={{ fontWeight: 500, textShadow: "0 0 40px rgba(255,255,255,0.4), 0 0 80px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.3)" }}
        >
          {currentTime}
        </div>
      </div>

      {/* Spacer to push user section to bottom */}
      <div className="flex-1" />

      {/* User Avatar and Name - at bottom */}
      <div className="mb-14 flex flex-col items-center relative z-10 px-6 w-full">
        <div className="w-full max-w-[360px] rounded-2xl border border-white/15 bg-black/35 backdrop-blur-xl shadow-2xl px-5 py-4">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-xl bg-white/10">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Image
                  src="/headshot.jpg"
                  alt="cozac"
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              )}
            </div>

            <div className="mt-2 text-sm font-medium text-white drop-shadow-md">
              {user ? displayName : "cozac.dev"}
            </div>

            {!user && (
              <div className="mt-1 text-xs text-white/75 drop-shadow-sm">
                개발자 구인구직 · 프로젝트 · 커뮤니티
              </div>
            )}

            <div className="mt-4 w-full">
              {user ? (
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="w-full h-10 rounded-md bg-white/90 hover:bg-white text-black text-[13px] font-semibold tracking-tight transition-colors"
                >
                  계속하기
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleLinkedInSignIn}
                    disabled={sending || authLoading}
                    className="w-full h-10 px-3 rounded-md bg-[#0a66c2] hover:bg-[#0958a8]
                      text-white text-[13px] font-semibold tracking-[0.01em] transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <title>LinkedIn</title>
                        <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.11 1 2.48 1h.02C3.87 1 4.98 2.12 4.98 3.5ZM.5 8h4V23h-4V8Zm7 0h3.84v2.05h.06c.54-1.02 1.86-2.1 3.82-2.1 4.08 0 4.83 2.69 4.83 6.18V23h-4v-7.75c0-1.85-.03-4.23-2.57-4.23-2.57 0-2.96 2.01-2.96 4.1V23h-4V8Z" />
                      </svg>
                      {sending || authLoading ? "연결 중..." : "LinkedIn으로 로그인"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnlock}
                    className="w-full h-10 rounded-md bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold transition-colors"
                  >
                    Guest로 둘러보기
                  </button>
                </div>
              )}
            </div>

            {(localError || authError) && (
              <div className="mt-2 text-[11px] text-[#ffb3b3]">
                {localError || authError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
