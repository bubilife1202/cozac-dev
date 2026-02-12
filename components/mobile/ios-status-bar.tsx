"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface IOSStatusBarProps {
  variant: "light" | "dark";
  showBackButton?: boolean;
  onGoHome?: () => void;
}

function useCurrentTime() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

export function IOSStatusBar({ variant, showBackButton, onGoHome }: IOSStatusBarProps) {
  const time = useCurrentTime();
  const color = variant === "light" ? "white" : "currentColor";

  return (
    <div
      className={cn(
        "absolute top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 select-none pointer-events-auto",
        "h-[44px]",
        variant === "light" ? "text-white" : "text-black dark:text-white"
      )}
    >
      {/* Left: Back button or Time */}
      {showBackButton ? (
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-0.5 text-[15px] font-semibold tracking-tight min-w-[54px]"
        >
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
            <path d="M10 2L2 10L10 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>홈</span>
        </button>
      ) : (
        <span className="text-[15px] font-semibold tracking-tight min-w-[54px]">
          {time}
        </span>
      )}

      {/* Center: Dynamic Island placeholder */}
      <div className="flex-1" />

      {/* Right: Status icons */}
      <div className="flex items-center gap-[5px]">
        {/* Cellular */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true" role="img">
          <rect x="0" y="9" width="3" height="3" rx="0.5" fill={color} />
          <rect x="4.5" y="6" width="3" height="6" rx="0.5" fill={color} />
          <rect x="9" y="3" width="3" height="9" rx="0.5" fill={color} />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill={color} />
        </svg>

        {/* WiFi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true" role="img">
          <path
            d="M8 11.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
            fill={color}
          />
          <path
            d="M5.17 8.33a4 4 0 015.66 0"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M2.83 5.83a7.08 7.08 0 0110.34 0"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M.5 3.33A10.1 10.1 0 0115.5 3.33"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Battery */}
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true" role="img">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="12"
            rx="2.5"
            stroke={color}
            strokeOpacity="0.35"
          />
          <rect
            x="2"
            y="2"
            width="19"
            height="9"
            rx="1.5"
            fill={color}
          />
          <path
            d="M24 4.5v4a2 2 0 000-4z"
            fill={color}
            fillOpacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}
