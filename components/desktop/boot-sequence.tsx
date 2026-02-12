"use client";

import { useState, useEffect } from "react";

interface BootSequenceProps {
  onComplete: () => void;
  autoStart?: boolean;
}

export function BootSequence({ onComplete, autoStart = true }: BootSequenceProps) {
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(autoStart);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!started) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 5;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [started, onComplete]);

  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      setPulse((prev) => !prev);
    }, 650);
    return () => clearInterval(timer);
  }, [started]);

  const start = () => setStarted(true);

  if (!started) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-7">
      <div
        className={`w-24 h-24 rounded-[26px] border border-white/20 flex items-center justify-center transition-all duration-500 ${
          pulse ? "bg-white/14 scale-105" : "bg-white/8 scale-100"
        }`}
      >
        <span className="text-white font-semibold text-2xl tracking-tight">cz</span>
      </div>

      <div className="text-center leading-tight">
        <div className="text-white/95 text-2xl font-semibold tracking-tight">cozac.dev</div>
        <div className="text-white/55 text-sm">starting virtual desktop</div>
      </div>

      <div className="w-52 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/80 rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className={`w-1.5 h-1.5 rounded-full bg-white/65 transition-all duration-300 ${pulse ? "opacity-100" : "opacity-45"}`} />
        <span className={`w-1.5 h-1.5 rounded-full bg-white/65 transition-all duration-300 delay-100 ${pulse ? "opacity-70" : "opacity-100"}`} />
        <span className={`w-1.5 h-1.5 rounded-full bg-white/65 transition-all duration-300 delay-200 ${pulse ? "opacity-45" : "opacity-70"}`} />
      </div>
    </div>
  );
}

// Hook for manual start control
export function useBootSequence() {
  const [isBooting, setIsBooting] = useState(false);
  const start = () => setIsBooting(true);
  const reset = () => setIsBooting(false);
  return { isBooting, start, reset };
}
