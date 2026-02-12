"use client";

import { LobbyView } from "./lobby-view";

interface LobbyAppProps {
  isMobile?: boolean;
  inShell?: boolean;
}

export function LobbyApp({ isMobile = false }: LobbyAppProps) {
  return (
    <div className="h-full w-full overflow-hidden">
      <LobbyView isMobile={isMobile} />
    </div>
  );
}
