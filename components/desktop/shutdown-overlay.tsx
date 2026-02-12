"use client";

import { useState } from "react";
import { BootSequence } from "./boot-sequence";

interface ShutdownOverlayProps {
  onBootComplete: () => void;
}

export function ShutdownOverlay({ onBootComplete }: ShutdownOverlayProps) {
  const [isBooting, setIsBooting] = useState(false);

  const handleClick = () => {
    if (!isBooting) {
      setIsBooting(true);
    }
  };

  return (
    <button
      type="button"
      className="fixed inset-0 z-[100] bg-[radial-gradient(circle_at_20%_20%,#1e3a8a_0%,#0b1220_38%,#000_100%)] flex items-center justify-center cursor-pointer"
      onClick={handleClick}
    >
      {isBooting && <BootSequence onComplete={onBootComplete} subtitle="booting up" />}
    </button>
  );
}
