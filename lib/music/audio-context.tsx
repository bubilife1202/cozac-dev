"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { PlaylistTrack, RepeatMode, PlaybackState } from "@/components/apps/music/types";
import { useSystemSettingsSafe } from "@/lib/system-settings-context";
import {
  destroyYouTubePlayer,
  ensureYouTubePlayer,
  extractYouTubeVideoId,
  YT_PLAYER_STATE,
  type YTPlayer,
} from "@/lib/music/youtube-player";

function isYouTubeTrack(track: PlaylistTrack | null | undefined): boolean {
  if (!track || track.previewUrl || !track.externalUrl) return false;
  return extractYouTubeVideoId(track.externalUrl) !== null;
}

interface AudioContextValue {
  playbackState: PlaybackState;
  play: (track: PlaylistTrack, queue: PlaylistTrack[]) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (progress: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

const STORAGE_KEY = "music-playback-state";

// Persist playback state including queue for next/previous to work after refresh
interface PersistedState {
  volume: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  currentTrack: PlaylistTrack | null;
  progress: number;
  queue: PlaylistTrack[];
  originalQueue: PlaylistTrack[];
  queueIndex: number;
}

function loadStoredState(): Partial<PlaybackState> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: PersistedState = JSON.parse(stored);
      return {
        volume: parsed.volume ?? 0.7,
        isShuffle: parsed.isShuffle ?? false,
        repeatMode: parsed.repeatMode ?? "off",
        currentTrack: parsed.currentTrack ?? null,
        progress: parsed.progress ?? 0,
        queue: parsed.queue ?? [],
        originalQueue: parsed.originalQueue ?? [],
        queueIndex: parsed.queueIndex ?? -1,
      };
    }
  } catch {
    // Ignore
  }
  return {};
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore - quota exceeded or private browsing
  }
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const defaultState: PlaybackState = {
  isPlaying: false,
  currentTrack: null,
  queue: [],
  originalQueue: [],
  queueIndex: -1,
  progress: 0,
  volume: 0.7,
  isShuffle: false,
  repeatMode: "off",
  duration: 0,
  error: null,
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { volume: systemVolume } = useSystemSettingsSafe();
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() => ({
    ...defaultState,
    ...loadStoredState(),
  }));

  // Keep a ref to the latest state for callbacks that need fresh values
  const stateRef = useRef(playbackState);
  stateRef.current = playbackState;

  // Forward declaration: assigned below, used by the YouTube state callback
  const handleTrackEndedRef = useRef<() => void>(() => {});

  const handleYouTubeStateChange = useCallback((state: number) => {
    if (state === YT_PLAYER_STATE.PLAYING) {
      const duration = ytPlayerRef.current?.getDuration() ?? 0;
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: true,
        duration: duration > 0 ? duration : prev.duration,
        error: null,
      }));
    } else if (state === YT_PLAYER_STATE.PAUSED) {
      setPlaybackState((prev) => ({ ...prev, isPlaying: false }));
    } else if (state === YT_PLAYER_STATE.ENDED) {
      handleTrackEndedRef.current();
    }
  }, []);

  const handleYouTubeError = useCallback((message: string) => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: false, error: message }));
  }, []);

  const youTubeVolume = useCallback(() => {
    return Math.round(systemVolume * stateRef.current.volume);
  }, [systemVolume]);

  // Route a track to the right player. YouTube tracks keep their saved
  // progress when the same track is resumed after a reload.
  const loadTrackIntoPlayer = useCallback(
    (track: PlaylistTrack, autoplay: boolean) => {
      if (isYouTubeTrack(track)) {
        const videoId = track.externalUrl
          ? extractYouTubeVideoId(track.externalUrl)
          : null;
        if (!videoId) return;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute("src");
        }
        const state = stateRef.current;
        const startSeconds =
          state.currentTrack?.id === track.id && state.progress > 0
            ? state.progress * track.duration
            : 0;
        ensureYouTubePlayer({
          onStateChange: handleYouTubeStateChange,
          onError: handleYouTubeError,
        })
          .then((yt) => {
            ytPlayerRef.current = yt;
            yt.setVolume(youTubeVolume());
            if (autoplay) {
              yt.loadVideoById({ videoId, startSeconds });
            } else {
              yt.cueVideoById({ videoId, startSeconds });
            }
          })
          .catch(() => {
            setPlaybackState((prev) => ({
              ...prev,
              isPlaying: false,
              error: "YouTube 플레이어를 불러오지 못했어요",
            }));
          });
        return;
      }

      ytPlayerRef.current?.pauseVideo();
      const audio = audioRef.current;
      if (!audio || !track.previewUrl) return;
      audio.src = track.previewUrl;
      if (autoplay) {
        audio.play().catch(console.error);
      }
    },
    [handleYouTubeStateChange, handleYouTubeError, youTubeVolume]
  );

  const handleTrackEnded = useCallback(() => {
    const { repeatMode, queue, queueIndex, currentTrack } = stateRef.current;

    if (repeatMode === "one") {
      if (isYouTubeTrack(currentTrack)) {
        ytPlayerRef.current?.seekTo(0, true);
        ytPlayerRef.current?.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    const nextIndex = queueIndex + 1;
    let targetIndex = -1;
    if (nextIndex < queue.length) {
      targetIndex = nextIndex;
    } else if (repeatMode === "all" && queue.length > 0) {
      targetIndex = 0;
    }

    const target = targetIndex >= 0 ? queue[targetIndex] : undefined;
    if (target && (target.previewUrl || isYouTubeTrack(target))) {
      loadTrackIntoPlayer(target, true);
      setPlaybackState((prev) => ({
        ...prev,
        currentTrack: target,
        queueIndex: targetIndex,
        progress: 0,
        error: null,
      }));
      return;
    }

    setPlaybackState((prev) => ({ ...prev, isPlaying: false, progress: 0 }));
  }, [loadTrackIntoPlayer]);

  handleTrackEndedRef.current = handleTrackEnded;

  // Debounced save - only saves after 1 second of no changes
  const debouncedSave = useCallback((state: PlaybackState) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState({
        volume: state.volume,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        currentTrack: state.currentTrack,
        progress: state.progress,
        queue: state.queue,
        originalQueue: state.originalQueue,
        queueIndex: state.queueIndex,
      });
    }, 1000);
  }, []);

  // Immediate save for important changes (track change, settings)
  const immediateSave = useCallback((state: PlaybackState) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveState({
      volume: state.volume,
      isShuffle: state.isShuffle,
      repeatMode: state.repeatMode,
      currentTrack: state.currentTrack,
      progress: state.progress,
      queue: state.queue,
      originalQueue: state.originalQueue,
      queueIndex: state.queueIndex,
    });
  }, []);

  // Create audio element on mount and restore track if available
  useEffect(() => {
    if (typeof window !== "undefined" && !audioRef.current) {
      const audio = new Audio();
      audio.volume = (systemVolume / 100) * playbackState.volume;

      // Handle metadata load - update duration and seek to saved progress
      const handleLoadedMetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          // Seek to saved progress on initial load (side effect outside setState)
          const state = stateRef.current;
          if (state.progress > 0 && !state.isPlaying) {
            audio.currentTime = state.progress * audio.duration;
          }
          setPlaybackState((prev) => ({ ...prev, duration: audio.duration }));
        }
      };

      // Handle playback errors
      const handleError = () => {
        const errorMessage = audio.error?.message || "Failed to load audio";
        console.error("Audio error:", errorMessage);
        setPlaybackState((prev) => ({
          ...prev,
          isPlaying: false,
          error: errorMessage,
        }));
      };

      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("error", handleError);

      // Restore track from persisted state (but don't auto-play)
      if (playbackState.currentTrack?.previewUrl) {
        audio.src = playbackState.currentTrack.previewUrl;
      }

      audioRef.current = audio;

      return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("error", handleError);
      };
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      destroyYouTubePlayer();
      ytPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Update audio volume when state or system volume changes
  useEffect(() => {
    if (audioRef.current) {
      const effectiveVolume = (systemVolume / 100) * playbackState.volume;
      audioRef.current.volume = effectiveVolume;
    }
    ytPlayerRef.current?.setVolume(
      Math.round(systemVolume * playbackState.volume)
    );
  }, [playbackState.volume, systemVolume]);

  // Debounced save for progress updates
  useEffect(() => {
    debouncedSave(playbackState);
  }, [playbackState.progress, debouncedSave, playbackState]);

  // Immediate save for important state changes
  const prevTrackRef = useRef(playbackState.currentTrack?.id);
  const prevVolumeRef = useRef(playbackState.volume);
  const prevShuffleRef = useRef(playbackState.isShuffle);
  const prevRepeatRef = useRef(playbackState.repeatMode);

  useEffect(() => {
    const trackChanged = prevTrackRef.current !== playbackState.currentTrack?.id;
    const volumeChanged = prevVolumeRef.current !== playbackState.volume;
    const shuffleChanged = prevShuffleRef.current !== playbackState.isShuffle;
    const repeatChanged = prevRepeatRef.current !== playbackState.repeatMode;

    if (trackChanged || volumeChanged || shuffleChanged || repeatChanged) {
      immediateSave(playbackState);
      prevTrackRef.current = playbackState.currentTrack?.id;
      prevVolumeRef.current = playbackState.volume;
      prevShuffleRef.current = playbackState.isShuffle;
      prevRepeatRef.current = playbackState.repeatMode;
    }
  }, [
    playbackState.currentTrack?.id,
    playbackState.volume,
    playbackState.isShuffle,
    playbackState.repeatMode,
    immediateSave,
    playbackState,
  ]);

  // Progress update interval (audio element or YouTube player)
  useEffect(() => {
    if (!playbackState.isPlaying) return;

    const interval = setInterval(() => {
      const track = stateRef.current.currentTrack;
      if (isYouTubeTrack(track)) {
        const yt = ytPlayerRef.current;
        if (yt) {
          const duration = yt.getDuration();
          if (duration > 0) {
            const progress = yt.getCurrentTime() / duration;
            setPlaybackState((prev) => ({ ...prev, progress, duration }));
          }
        }
        return;
      }
      if (audioRef.current && !audioRef.current.paused && audioRef.current.duration > 0) {
        const progress =
          audioRef.current.currentTime / audioRef.current.duration;
        setPlaybackState((prev) => ({ ...prev, progress }));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [playbackState.isPlaying]);

  // Handle audio element ending (YouTube endings arrive via handleYouTubeStateChange)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => handleTrackEndedRef.current();

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, []);

  // Play a track (iTunes preview or YouTube embed)
  const play = useCallback((track: PlaylistTrack, tracks: PlaylistTrack[]) => {
    if (!track.previewUrl && !isYouTubeTrack(track)) {
      console.warn("No playable source for track:", track.name);
      return;
    }

    loadTrackIntoPlayer(track, true);

    setPlaybackState((prev) => {
      // If shuffle is on, create shuffled queue with selected track first
      let queue: PlaylistTrack[];
      let queueIndex: number;

      if (prev.isShuffle) {
        const otherTracks = tracks.filter((t) => t.id !== track.id);
        queue = [track, ...shuffleArray(otherTracks)];
        queueIndex = 0;
      } else {
        queue = tracks;
        queueIndex = tracks.findIndex((t) => t.id === track.id);
        if (queueIndex < 0) queueIndex = 0;
      }

      return {
        ...prev,
        isPlaying: true,
        currentTrack: track,
        queue,
        originalQueue: tracks,
        queueIndex,
        progress: 0,
        error: null,
      };
    });
  }, [loadTrackIntoPlayer]);

  const pause = useCallback(() => {
    if (isYouTubeTrack(stateRef.current.currentTrack)) {
      ytPlayerRef.current?.pauseVideo();
      setPlaybackState((prev) => ({ ...prev, isPlaying: false }));
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaybackState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, []);

  const resume = useCallback(() => {
    const track = stateRef.current.currentTrack;
    if (track && isYouTubeTrack(track)) {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.setVolume(youTubeVolume());
        ytPlayerRef.current.playVideo();
      } else {
        loadTrackIntoPlayer(track, true);
      }
      setPlaybackState((prev) => ({ ...prev, isPlaying: true, error: null }));
      return;
    }
    if (audioRef.current && playbackState.currentTrack) {
      audioRef.current.play().catch(console.error);
      setPlaybackState((prev) => ({ ...prev, isPlaying: true, error: null }));
    }
  }, [playbackState.currentTrack, loadTrackIntoPlayer, youTubeVolume]);

  const stop = useCallback(() => {
    ytPlayerRef.current?.stopVideo();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTrack: null,
      progress: 0,
      queue: [],
      originalQueue: [],
      queueIndex: -1,
      error: null,
    }));
  }, []);

  const next = useCallback(() => {
    const { queue, queueIndex, repeatMode, isPlaying } = stateRef.current;
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else {
        return;
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack && (nextTrack.previewUrl || isYouTubeTrack(nextTrack))) {
      loadTrackIntoPlayer(nextTrack, isPlaying);
      setPlaybackState((prev) => ({
        ...prev,
        currentTrack: nextTrack,
        queueIndex: nextIndex,
        progress: 0,
        error: null,
      }));
    }
  }, [loadTrackIntoPlayer]);

  const previous = useCallback(() => {
    const { queue, queueIndex, isPlaying } = stateRef.current;
    if (queue.length === 0) return;

    const currentTrack = stateRef.current.currentTrack;
    const currentTime = isYouTubeTrack(currentTrack)
      ? ytPlayerRef.current?.getCurrentTime() ?? 0
      : audioRef.current?.currentTime ?? 0;

    if (currentTime > 3) {
      if (isYouTubeTrack(currentTrack)) {
        ytPlayerRef.current?.seekTo(0, true);
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setPlaybackState((prev) => ({ ...prev, progress: 0 }));
      return;
    }

    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) {
      const prevTrack = queue[prevIndex];
      if (prevTrack && (prevTrack.previewUrl || isYouTubeTrack(prevTrack))) {
        loadTrackIntoPlayer(prevTrack, isPlaying);
        setPlaybackState((prev) => ({
          ...prev,
          currentTrack: prevTrack,
          queueIndex: prevIndex,
          progress: 0,
          error: null,
        }));
      }
    }
  }, [loadTrackIntoPlayer]);

  const seek = useCallback((progress: number) => {
    if (isYouTubeTrack(stateRef.current.currentTrack)) {
      const yt = ytPlayerRef.current;
      if (yt) {
        const duration = yt.getDuration();
        if (duration > 0) {
          yt.seekTo(progress * duration, true);
          setPlaybackState((prev) => ({ ...prev, progress }));
        }
      }
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = progress * audio.duration;
      setPlaybackState((prev) => ({ ...prev, progress }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (audioRef.current) {
      audioRef.current.volume = (systemVolume / 100) * clampedVolume;
    }
    ytPlayerRef.current?.setVolume(Math.round(systemVolume * clampedVolume));
    setPlaybackState((prev) => ({ ...prev, volume: clampedVolume }));
  }, [systemVolume]);

  // Toggle shuffle mode
  const toggleShuffle = useCallback(() => {
    setPlaybackState((prev) => {
      const newIsShuffle = !prev.isShuffle;
      const currentTrack = prev.currentTrack;

      // If we have an active queue, reshuffle or restore it
      if (prev.originalQueue.length > 0 && currentTrack) {
        let newQueue: PlaylistTrack[];
        let newQueueIndex: number;

        if (newIsShuffle) {
          // Turning shuffle ON: shuffle remaining tracks, keep current at front
          const otherTracks = prev.originalQueue.filter((t) => t.id !== currentTrack.id);
          newQueue = [currentTrack, ...shuffleArray(otherTracks)];
          newQueueIndex = 0;
        } else {
          // Turning shuffle OFF: restore original order
          newQueue = prev.originalQueue;
          newQueueIndex = prev.originalQueue.findIndex((t) => t.id === currentTrack.id);
          if (newQueueIndex < 0) newQueueIndex = 0;
        }

        return {
          ...prev,
          isShuffle: newIsShuffle,
          queue: newQueue,
          queueIndex: newQueueIndex,
        };
      }

      return { ...prev, isShuffle: newIsShuffle };
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    setPlaybackState((prev) => {
      const modes: RepeatMode[] = ["off", "all", "one"];
      const currentIndex = modes.indexOf(prev.repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      return { ...prev, repeatMode: nextMode };
    });
  }, []);

  return (
    <AudioContext.Provider
      value={{
        playbackState,
        play,
        pause,
        resume,
        stop,
        next,
        previous,
        seek,
        setVolume,
        toggleShuffle,
        toggleRepeat,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
}
