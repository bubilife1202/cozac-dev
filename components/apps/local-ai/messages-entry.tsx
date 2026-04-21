"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole, MessageSquareText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LocalAgentMessagesEntryProps {
  className?: string;
  summary?: string;
  onOpenLocalAgent?: () => void;
}

export function LocalAgentMessagesEntry({
  className,
  summary = "Open the browser-native Local Agent workbench. Messages only deep-links; it never enters the existing chat sender.",
  onOpenLocalAgent,
}: LocalAgentMessagesEntryProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenLocalAgent) return;

    event.preventDefault();
    onOpenLocalAgent();
  };

  return (
    <div
      className={cn(
        "rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-left text-emerald-950 dark:text-emerald-50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-5 w-5" />
          Local Agent
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <ShieldCheck className="h-3.5 w-3.5" />
          local-only
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-emerald-900/80 dark:text-emerald-50/80">{summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-emerald-900/75 dark:text-emerald-100/75">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/50 px-2 py-1 dark:bg-emerald-950/45">
          <LockKeyhole className="h-3.5 w-3.5" />
          no chat sender
        </span>
        <span className="rounded-full bg-white/50 px-2 py-1 dark:bg-emerald-950/45">no server chat</span>
      </div>
      <Button asChild className="mt-4 rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
        <Link href="/local-ai" onClick={handleClick}>
          Open workbench
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
