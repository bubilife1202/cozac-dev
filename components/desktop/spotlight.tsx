"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileText, Search } from "lucide-react";
import { APPS } from "@/lib/app-config";
import { getOptionalClient } from "@/utils/supabase/client";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { cn } from "@/lib/utils";
import type { AppConfig } from "@/types/apps";
import type { Note } from "@/lib/notes/types";

// Grouped sections cap out at ~8 combined results
const MAX_APP_RESULTS = 4;
const MAX_NOTE_RESULTS = 4;

type SpotlightResult =
  | { kind: "app"; app: AppConfig }
  | { kind: "note"; note: Note };

interface SpotlightProps {
  onClose: () => void;
  onOpenApp: (appId: string) => void;
  onOpenNote: (slug: string) => void;
}

export function Spotlight({ onClose, onOpenApp, onOpenNote }: SpotlightProps) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const supabase = useRef(getOptionalClient()).current;

  useClickOutside(panelRef, onClose, true);

  // Focus the search field on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch public notes once per open - the same list the Notes app shows
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function fetchNotes() {
      const { data } = await client
        .from("notes")
        .select("*")
        .eq("public", true)
        .order("created_at", { ascending: false });
      if (!cancelled && data) {
        setNotes(data);
      }
    }

    fetchNotes();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const normalizedQuery = query.trim().toLowerCase();

  const appResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return APPS.filter(
      (app) =>
        app.name.toLowerCase().includes(normalizedQuery) ||
        app.id.toLowerCase().includes(normalizedQuery)
    ).slice(0, MAX_APP_RESULTS);
  }, [normalizedQuery]);

  const noteResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return notes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(normalizedQuery) ||
          note.content.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, MAX_NOTE_RESULTS);
  }, [normalizedQuery, notes]);

  const results = useMemo<SpotlightResult[]>(
    () => [
      ...appResults.map((app) => ({ kind: "app" as const, app })),
      ...noteResults.map((note) => ({ kind: "note" as const, note })),
    ],
    [appResults, noteResults]
  );

  const openResult = useCallback(
    (result: SpotlightResult) => {
      if (result.kind === "app") {
        onOpenApp(result.app.id);
      } else {
        onOpenNote(result.note.slug);
      }
      onClose();
    },
    [onOpenApp, onOpenNote, onClose]
  );

  // Reset the selection whenever the query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  // Keyboard navigation: arrows move the selection, Enter opens, Esc closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex((prev) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (prev + delta + results.length) % results.length;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const result = results[selectedIndex];
        if (result) openResult(result);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [results, selectedIndex, onClose, openResult]);

  // Keep the selected row visible while navigating
  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const hasQuery = normalizedQuery.length > 0;
  const hasResults = results.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[20vh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Spotlight"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-black/10 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-800/95"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spotlight 검색"
            aria-label="Spotlight 검색"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-xl text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        {hasQuery && (
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto border-t border-black/10 py-1 dark:border-white/10"
          >
            {appResults.length > 0 && (
              <div>
                <div className="px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                  앱
                </div>
                {appResults.map((app, index) => (
                  <button
                    key={app.id}
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => openResult({ kind: "app", app })}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm",
                      selectedIndex === index
                        ? "bg-blue-500 text-white"
                        : "text-gray-900 dark:text-gray-100"
                    )}
                  >
                    <Image
                      src={app.icon}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                    />
                    <span className="flex-1 truncate">{app.name}</span>
                  </button>
                ))}
              </div>
            )}

            {noteResults.length > 0 && (
              <div>
                <div className="px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                  노트
                </div>
                {noteResults.map((note, index) => {
                  const flatIndex = appResults.length + index;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      data-index={flatIndex}
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      onClick={() => openResult({ kind: "note", note })}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm",
                        selectedIndex === flatIndex
                          ? "bg-blue-500 text-white"
                          : "text-gray-900 dark:text-gray-100"
                      )}
                    >
                      {note.emoji ? (
                        <span className="flex h-6 w-6 items-center justify-center text-lg leading-none">
                          {note.emoji}
                        </span>
                      ) : (
                        <FileText className="h-5 w-6 text-gray-400" />
                      )}
                      <span className="flex-1 truncate">{note.title || "new note"}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!hasResults && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                ‘{query}’에 대한 결과 없음
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
