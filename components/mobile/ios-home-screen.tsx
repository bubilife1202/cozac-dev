"use client";

import Image from "next/image";
import { useSystemSettings } from "@/lib/system-settings-context";
import { getWallpaperPath } from "@/lib/os-versions";
import { APPS } from "@/lib/app-config";
import type { AppConfig } from "@/types/apps";

interface IOSHomeScreenProps {
  onAppOpen: (appId: string) => void;
}

const DOCK_APP_IDS = ["notes", "messages", "music", "settings"];

function getGridApps(): AppConfig[] {
  return APPS.filter(
    (app) => !DOCK_APP_IDS.includes(app.id) && app.showOnDockByDefault !== false
  );
}

function getDockApps(): AppConfig[] {
  return DOCK_APP_IDS.map((id) => APPS.find((app) => app.id === id)).filter(
    Boolean
  ) as AppConfig[];
}

function AppIcon({
  app,
  onTap,
  size = 60,
}: {
  app: AppConfig;
  onTap: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="active:scale-[0.85] active:brightness-90 transition-all duration-200 ease-out"
    >
      <div
        className="rounded-[14px] overflow-hidden shadow-lg"
        style={{ width: size, height: size }}
      >
        <Image
          src={app.icon}
          alt={app.name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
      <span className="text-[11px] text-white font-medium leading-tight text-center truncate w-[68px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        {app.name}
      </span>
    </button>
  );
}

export function IOSHomeScreen({ onAppOpen }: IOSHomeScreenProps) {
  const { osVersionId } = useSystemSettings();
  const wallpaperPath = getWallpaperPath(osVersionId);
  const gridApps = getGridApps();
  const dockApps = getDockApps();

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="absolute inset-0">
        <Image
          src={wallpaperPath}
          alt=""
          fill
          className="object-cover"
          priority
          draggable={false}
        />
      </div>

      <div className="relative flex-1 pt-[60px] px-6 pb-4 overflow-y-auto overscroll-y-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="grid grid-cols-4 gap-y-6 gap-x-4 justify-items-center">
          {gridApps.map((app) => (
            <AppIcon key={app.id} app={app} onTap={() => onAppOpen(app.id)} />
          ))}
        </div>
      </div>

      <div className="relative mx-3 mb-2 rounded-[26px] px-4 py-3 flex items-center justify-around backdrop-blur-2xl bg-white/20 border border-white/10">
        {dockApps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => onAppOpen(app.id)}
            className="active:scale-[0.85] active:brightness-90 transition-all duration-200 ease-out"
          >
            <div className="w-[58px] h-[58px] rounded-[14px] overflow-hidden shadow-lg">
              <Image
                src={app.icon}
                alt={app.name}
                width={58}
                height={58}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
