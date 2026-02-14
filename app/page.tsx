"use client";

import { useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { Desktop } from "@/components/desktop/desktop";

export default function Home() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  if (isMobile) {
    return <MobileShell />;
  }

  if (isMobile === null) {
    return <div className="min-h-dvh bg-background" />;
  }

  return <Desktop />;
}
