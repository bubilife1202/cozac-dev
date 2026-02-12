"use client";

import { BootSequence } from "./boot-sequence";

interface RestartOverlayProps {
  onBootComplete: () => void;
}

export function RestartOverlay({ onBootComplete }: RestartOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-[radial-gradient(circle_at_20%_20%,#1e3a8a_0%,#0b1220_38%,#000_100%)] flex items-center justify-center">
      <BootSequence onComplete={onBootComplete} subtitle="restarting system" />
    </div>
  );
}
