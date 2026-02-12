"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface IOSHomeIndicatorProps {
  variant: "light" | "dark";
  onGoHome?: () => void;
}

export function IOSHomeIndicator({ variant, onGoHome }: IOSHomeIndicatorProps) {
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      touchStartY.current = null;
      if (deltaY > 30 && onGoHome) {
        onGoHome();
      }
    },
    [onGoHome]
  );

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[100] flex items-end justify-center pb-2",
        onGoHome ? "h-[120px]" : "h-[34px] pointer-events-none"
      )}
      onTouchStart={onGoHome ? handleTouchStart : undefined}
      onTouchEnd={onGoHome ? handleTouchEnd : undefined}
    >
      <div
        className={cn(
          "w-[134px] h-[5px] rounded-full",
          variant === "light" ? "bg-white/60" : "bg-black/30 dark:bg-white/40"
        )}
      />
    </div>
  );
}
