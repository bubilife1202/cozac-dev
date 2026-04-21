"use client";

import App from "./app";
import { isSupabaseConfigured } from "@/utils/supabase/config";
import { ServiceUnavailable } from "@/components/ui/service-unavailable";

interface PhotosAppProps {
  isMobile?: boolean;
  inShell?: boolean;
}

export function PhotosApp({ isMobile = false, inShell = false }: PhotosAppProps) {
  if (!isSupabaseConfigured()) {
    return (
      <ServiceUnavailable
        title="Photos are temporarily offline."
        description="The photo library will be back after the storage service is restored."
      />
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <App isDesktop={!isMobile} inShell={inShell} />
    </div>
  );
}
