"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/mobile/mobile-shell";

export default function Home() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mobile = window.innerWidth < 768;
    if (mobile) {
      setIsMobile(true);
    } else {
      router.replace("/notes/about-me");
    }
  }, [router]);

  if (isMobile) {
    return <MobileShell />;
  }

  return <div className="min-h-dvh bg-background" />;
}
