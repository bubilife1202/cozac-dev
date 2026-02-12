"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Playlist, PlaylistTrack } from "../types";
import { useAudio } from "@/lib/music/audio-context";
import { Play, Pause } from "lucide-react";

interface HomeViewProps {
  playlists: Playlist[];
  songs: PlaylistTrack[];
  onPlaylistSelect: (playlistId: string) => void;
  isMobileView: boolean;
}

export function HomeView({
  playlists,
  songs,
  onPlaylistSelect,
  isMobileView,
}: HomeViewProps) {
  const { playbackState, play, pause } = useAudio();

  const handlePlayPlaylist = (playlist: Playlist, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPlayingThisPlaylist =
      playbackState.isPlaying &&
      playbackState.currentTrack &&
      playlist.tracks.some((t) => t.id === playbackState.currentTrack?.id);

    if (isPlayingThisPlaylist) {
      pause();
    } else {
      onPlaylistSelect(playlist.id);
      const firstPlayable = playlist.tracks.find((t) => t.previewUrl);
      if (firstPlayable) {
        play(firstPlayable, playlist.tracks);
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className={cn("p-6", isMobileView && "p-4 pb-20")}>
        {/* Your Playlists - Horizontal Scroll */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Playlists</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {playlists.map((playlist) => {
              const isPlaying =
                playbackState.isPlaying &&
                playbackState.currentTrack &&
                playlist.tracks.some((t) => t.id === playbackState.currentTrack?.id);

              return (
                <div
                  key={playlist.id}
                  onClick={() => onPlaylistSelect(playlist.id)}
                  className="group cursor-pointer flex-shrink-0 w-32"
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-muted">
                    {playlist.tracks[0]?.albumArt ? (
                      <Image
                        src={playlist.tracks[0].albumArt}
                        alt={playlist.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800" />
                    )}
                    <div
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center"
                      onClick={(e) => handlePlayPlaylist(playlist, e)}
                    >
                      {isPlaying ? (
                        <Pause className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      ) : (
                        <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-medium truncate">{playlist.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {playlist.tracks.length} songs
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Your Songs - Horizontal Scroll */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Songs</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {songs.map((song) => {
              const isPlaying =
                playbackState.isPlaying &&
                playbackState.currentTrack?.id === song.id;

              return (
                <div
                  key={song.id}
                  onClick={() => song.previewUrl && play(song, songs)}
                  className={cn(
                    "group flex-shrink-0 w-32",
                    song.previewUrl && "cursor-pointer"
                  )}
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-muted">
                    <Image
                      src={song.albumArt}
                      alt={song.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {song.previewUrl && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        {isPlaying ? (
                          <Pause className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{song.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {song.artist}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
