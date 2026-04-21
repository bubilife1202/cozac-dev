"use client";

import { LobbyView } from "./lobby-view";
import { isSupabaseConfigured } from "@/utils/supabase/config";
import { ServiceUnavailable } from "@/components/ui/service-unavailable";

interface LobbyAppProps {
  isMobile?: boolean;
  inShell?: boolean;
}

export function LobbyApp({ isMobile = false }: LobbyAppProps) {
  if (!isSupabaseConfigured()) {
    return (
      <ServiceUnavailable
        title="Lobby is temporarily offline."
        description="Community messages will come back after the database is restored."
        tone="dark"
      />
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <LobbyView isMobile={isMobile} />
    </div>
  );
}
