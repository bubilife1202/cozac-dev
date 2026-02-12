"use client";

import { useState, useEffect, useCallback } from "react";
import { RecentsProvider } from "@/lib/recents-context";
import { NotesApp } from "@/components/apps/notes/notes-app";
import { MessagesApp } from "@/components/apps/messages/messages-app";
import { SettingsApp } from "@/components/apps/settings/settings-app";
import { ITermApp } from "@/components/apps/iterm/iterm-app";
import { FinderApp } from "@/components/apps/finder/finder-app";
import { PhotosApp } from "@/components/apps/photos/photos-app";
import { CalendarApp } from "@/components/apps/calendar/calendar-app";
import { MusicApp } from "@/components/apps/music/music-app";
import { TextEditApp } from "@/components/apps/textedit";
import { PreviewApp, type PreviewFileType } from "@/components/apps/preview";
import { getTextEditContent } from "@/lib/file-storage";
import { getTopmostWindowForApp } from "@/lib/window-context";
import { getPreviewMetadataFromPath } from "@/lib/preview-utils";
import { IOSStatusBar } from "@/components/mobile/ios-status-bar";
import { IOSHomeScreen } from "@/components/mobile/ios-home-screen";
import { IOSHomeIndicator } from "@/components/mobile/ios-home-indicator";

type AppTransition = "idle" | "opening" | "closing";

interface MobileShellProps {
  initialApp?: string;
  initialNoteSlug?: string;
}

export function MobileShell({ initialApp, initialNoteSlug }: MobileShellProps) {
  const [activeApp, setActiveApp] = useState<string | null>(initialApp || null);
  const [renderedApp, setRenderedApp] = useState<string | null>(initialApp || null);
  const [transition, setTransition] = useState<AppTransition>("idle");
  const [isHydrated, setIsHydrated] = useState(false);

  const [topmostTextEdit, setTopmostTextEdit] = useState<{ filePath: string; content: string } | null>(null);
  const [topmostPreview, setTopmostPreview] = useState<{ filePath: string; fileUrl: string; fileType: PreviewFileType } | null>(null);

  useEffect(() => {
    const textEditWindow = getTopmostWindowForApp("textedit");
    const hasSavedTextEdit = Boolean(textEditWindow?.metadata?.filePath);
    if (hasSavedTextEdit) {
      setTopmostTextEdit({
        filePath: textEditWindow!.metadata!.filePath as string,
        content: (textEditWindow!.metadata!.content as string) ?? "",
      });
    }

    const previewWindow = getTopmostWindowForApp("preview");
    const hasSavedPreview = Boolean(
      previewWindow?.metadata?.filePath && previewWindow?.metadata?.fileUrl && previewWindow?.metadata?.fileType
    );
    if (hasSavedPreview) {
      setTopmostPreview({
        filePath: previewWindow!.metadata!.filePath as string,
        fileUrl: previewWindow!.metadata!.fileUrl as string,
        fileType: previewWindow!.metadata!.fileType as PreviewFileType,
      });
    }

    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const fileParam = searchParams.get("file");

    let detectedApp: string | null = null;
    if (path.startsWith("/settings")) detectedApp = "settings";
    else if (path.startsWith("/messages")) detectedApp = "messages";
    else if (path.startsWith("/notes")) detectedApp = "notes";
    else if (path.startsWith("/iterm")) detectedApp = "iterm";
    else if (path.startsWith("/finder")) detectedApp = "finder";
    else if (path.startsWith("/photos")) detectedApp = "photos";
    else if (path.startsWith("/calendar")) detectedApp = "calendar";
    else if (path.startsWith("/music")) detectedApp = "music";
    else if (path.startsWith("/textedit")) detectedApp = "textedit";
    else if (path.startsWith("/preview")) detectedApp = "preview";
    else if (initialApp) detectedApp = initialApp;

    if (detectedApp) {
      setActiveApp(detectedApp);
      setRenderedApp(detectedApp);
    }

    if (fileParam) {
      if (path.startsWith("/textedit") && !hasSavedTextEdit) {
        setTopmostTextEdit({
          filePath: fileParam,
          content: getTextEditContent(fileParam) ?? "",
        });
      }

      if (path.startsWith("/preview") && !hasSavedPreview) {
        const previewMetadata = getPreviewMetadataFromPath(fileParam);
        if (previewMetadata) {
          setTopmostPreview({
            filePath: fileParam,
            fileUrl: previewMetadata.fileUrl,
            fileType: previewMetadata.fileType,
          });
        }
      }
    }
    setIsHydrated(true);
  }, [initialApp]);

  const handleAppOpen = useCallback((appId: string) => {
    setRenderedApp(appId);
    setTransition("opening");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveApp(appId);
        setTimeout(() => setTransition("idle"), 350);
      });
    });
  }, []);

  const handleGoHome = useCallback(() => {
    setTransition("closing");
    setTimeout(() => {
      setActiveApp(null);
      setRenderedApp(null);
      setTransition("idle");
    }, 280);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (activeApp !== null) {
        handleGoHome();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeApp, handleGoHome]);

  if (!isHydrated) {
    return <div className="min-h-dvh bg-background" />;
  }

  const isOnHomeScreen = activeApp === null && transition === "idle";
  const isAppVisible = renderedApp !== null;

  return (
    <RecentsProvider>
      <div className="h-dvh relative overflow-hidden bg-black">
        <div className="absolute inset-0">
          <IOSStatusBar variant={isOnHomeScreen ? "light" : "dark"} />
          <IOSHomeScreen onAppOpen={handleAppOpen} />
          <IOSHomeIndicator variant="light" />
        </div>

        {isAppVisible && (
          <div
            className="absolute inset-0 z-50 flex flex-col bg-background origin-center"
            style={{
              transition: transition === "opening" 
                ? "transform 350ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 250ms ease-out"
                : "transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-in",
              transform: transition === "closing"
                ? "scale(0.92) translateY(20px)"
                : transition === "opening" && activeApp !== renderedApp
                  ? "scale(0.85) translateY(30px)"
                  : "scale(1) translateY(0)",
              opacity: transition === "closing"
                ? 0
                : transition === "opening" && activeApp !== renderedApp
                  ? 0
                  : 1,
              borderRadius: transition === "closing" || (transition === "opening" && activeApp !== renderedApp)
                ? "32px"
                : "0px",
            }}
          >
            <IOSStatusBar variant="dark" showBackButton onGoHome={handleGoHome} />
            <div className="flex-1 min-h-0 pt-[44px]">
              {renderedApp === "notes" && (
                <NotesApp isMobile={true} inShell={false} initialSlug={initialNoteSlug} />
              )}
              {renderedApp === "messages" && <MessagesApp isMobile={true} inShell={false} />}
              {renderedApp === "settings" && <SettingsApp isMobile={true} inShell={false} />}
              {renderedApp === "iterm" && <ITermApp isMobile={true} inShell={false} />}
              {renderedApp === "finder" && <FinderApp isMobile={true} inShell={false} />}
              {renderedApp === "photos" && <PhotosApp isMobile={true} inShell={false} />}
              {renderedApp === "calendar" && <CalendarApp isMobile={true} inShell={false} />}
              {renderedApp === "music" && <MusicApp isMobile={true} />}
              {renderedApp === "textedit" && (() => {
                const filePath = topmostTextEdit?.filePath;
                const content = topmostTextEdit?.content
                  ?? (filePath ? getTextEditContent(filePath) ?? "" : "");
                return (
                  <TextEditApp
                    isMobile={true}
                    inShell={false}
                    initialFilePath={filePath}
                    initialContent={content}
                  />
                );
              })()}
              {renderedApp === "preview" && (
                <PreviewApp
                  isMobile={true}
                  filePath={topmostPreview?.filePath}
                  fileUrl={topmostPreview?.fileUrl}
                  fileType={topmostPreview?.fileType}
                />
              )}
            </div>
            <IOSHomeIndicator variant="dark" onGoHome={handleGoHome} />
          </div>
        )}
      </div>
    </RecentsProvider>
  );
}
