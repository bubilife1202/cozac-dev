"use client";

interface YTPlayerEvent {
  data: number;
}

interface YTPlayerOptions {
  width?: string;
  height?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: YTPlayerEvent) => void;
    onError?: () => void;
  };
}

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

interface YTGlobal {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

type WindowWithYT = Window & {
  YT?: YTGlobal;
  onYouTubeIframeAPIReady?: () => void;
};

export const YT_PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
} as const;

let apiPromise: Promise<YTGlobal> | null = null;
let player: YTPlayer | null = null;
let hostElement: HTMLElement | null = null;
let ensurePromise: Promise<YTPlayer> | null = null;

function loadYouTubeIframeAPI(): Promise<YTGlobal> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const win = window as WindowWithYT;
    if (win.YT?.Player) {
      resolve(win.YT);
      return;
    }
    const previousCallback = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (win.YT?.Player) {
        resolve(win.YT);
      } else {
        reject(new Error("YouTube API failed to initialize"));
      }
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube API"));
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface YouTubePlayerCallbacks {
  onStateChange: (state: number) => void;
  onError: (message: string) => void;
}

export function ensureYouTubePlayer(
  callbacks: YouTubePlayerCallbacks
): Promise<YTPlayer> {
  if (player) return Promise.resolve(player);
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const YT = await loadYouTubeIframeAPI();
    hostElement = document.createElement("div");
    hostElement.setAttribute("aria-hidden", "true");
    hostElement.style.cssText =
      "position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;";
    const mountPoint = document.createElement("div");
    hostElement.appendChild(mountPoint);
    document.body.appendChild(hostElement);

    const created = await new Promise<YTPlayer>((resolve) => {
      const instance: YTPlayer = new YT.Player(mountPoint, {
        width: "2",
        height: "2",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
        },
        events: {
          onReady: () => resolve(instance),
          onStateChange: (event) => callbacks.onStateChange(event.data),
          onError: () => callbacks.onError("YouTube 영상을 재생할 수 없어요"),
        },
      });
    });
    player = created;
    return created;
  })();

  return ensurePromise;
}

export function destroyYouTubePlayer(): void {
  player?.destroy();
  player = null;
  ensurePromise = null;
  hostElement?.remove();
  hostElement = null;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id || null;
    }
    if (parsed.hostname.endsWith("youtube.com")) {
      const watchId = parsed.searchParams.get("v");
      if (watchId) return watchId;
      const match = parsed.pathname.match(/^\/(embed|shorts)\/([^/?]+)/);
      if (match) return match[2];
    }
    return null;
  } catch {
    return null;
  }
}
