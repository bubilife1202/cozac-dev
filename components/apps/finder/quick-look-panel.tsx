"use client";

import { useEffect, useState } from "react";
import { PdfViewer } from "@/components/apps/preview/pdf-viewer";

// Structural mirror of Finder's FileItem (kept local to avoid import cycles)
interface QuickLookFile {
  name: string;
  type: "file" | "dir" | "app";
  path: string;
  icon?: string;
  displayName?: string;
}

interface QuickLookPreview {
  fileUrl: string;
  fileType: "image" | "pdf";
}

interface QuickLookPanelProps {
  file: QuickLookFile;
  preview: QuickLookPreview | null;
  loadTextContent: (file: QuickLookFile) => Promise<string | null>;
  getKind: (file: QuickLookFile) => string;
  onClose: () => void;
}

type TextState =
  | { status: "loading" }
  | { status: "loaded"; content: string }
  | { status: "error" };

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-zinc-500 dark:text-zinc-400">
      <div className="flex flex-col items-center gap-2">
        <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

function UnavailableContent({ fileName, message }: { fileName: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <svg className="w-16 h-16 text-zinc-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
      </svg>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 break-all">{fileName}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{message}</p>
    </div>
  );
}

// macOS Quick Look style floating panel: centered, translucent, traffic-light-less
export function QuickLookPanel({ file, preview, loadTextContent, getKind, onClose }: QuickLookPanelProps) {
  const fileName = file.displayName || file.name;
  const [imageError, setImageError] = useState(false);
  const [textState, setTextState] = useState<TextState>({ status: "loading" });

  // Reset image error state when the previewed file changes
  useEffect(() => {
    setImageError(false);
  }, [file.path, preview?.fileUrl]);

  // Load text content for files that are not images/PDFs
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    setTextState({ status: "loading" });
    loadTextContent(file)
      .then((content) => {
        if (cancelled) return;
        setTextState(content === null ? { status: "error" } : { status: "loaded", content });
      })
      .catch(() => {
        if (!cancelled) setTextState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [preview, file, loadTextContent]);

  const renderContent = () => {
    if (preview?.fileType === "pdf") {
      return <PdfViewer fileUrl={preview.fileUrl} fileName={fileName} />;
    }

    if (preview?.fileType === "image") {
      if (imageError) {
        return <UnavailableContent fileName={fileName} message="The image could not be loaded" />;
      }
      return (
        <div className="flex h-full items-center justify-center p-3">
          <img
            src={preview.fileUrl}
            alt={fileName}
            draggable={false}
            className="max-h-full max-w-full object-contain select-none"
            onError={() => setImageError(true)}
          />
        </div>
      );
    }

    if (textState.status === "loading") {
      return <LoadingSpinner label="Loading..." />;
    }

    if (textState.status === "error") {
      return <UnavailableContent fileName={fileName} message="The file couldn&apos;t be previewed" />;
    }

    return (
      <pre className="h-full overflow-auto p-4 text-[13px] leading-relaxed font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
        {textState.content}
      </pre>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
      <div
        className="pointer-events-auto flex h-[420px] w-[560px] max-w-full max-h-full flex-col overflow-hidden rounded-xl border border-black/10 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-800/95"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header: close button + file name + kind */}
        <div className="flex items-center gap-2 border-b border-zinc-200/60 px-2.5 py-2 dark:border-zinc-700/60">
          <button
            onClick={onClose}
            aria-label="Close Quick Look"
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-300/80 text-zinc-600 transition-colors hover:bg-zinc-400/80 dark:bg-zinc-600/80 dark:text-zinc-300 dark:hover:bg-zinc-500/80"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {fileName}
          </span>
          <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{getKind(file)}</span>
        </div>
        {/* Content */}
        <div className="min-h-0 flex-1">{renderContent()}</div>
      </div>
    </div>
  );
}
