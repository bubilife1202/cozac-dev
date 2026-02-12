"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

const SPRING_BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const SPRING_DECEL = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_DURATION = 420;
const CLOSE_DURATION = 340;
const DISMISS_THRESHOLD = 150;
const RUBBER_BAND_COEFF = 0.45;
const VELOCITY_DISMISS = 800;

interface MobileShellProps {
  initialApp?: string;
  initialNoteSlug?: string;
}

/**
 * iOS-style rubber band: diminishing returns as you drag further.
 * f(x) = c * x * d / (d + c * x)
 */
function rubberBand(offset: number, dimension: number, coeff: number): number {
  return (coeff * offset * dimension) / (dimension + coeff * offset);
}

function springAnimate(
  el: HTMLElement,
  fromY: number,
  fromScale: number,
  fromRadius: number,
  toY: number,
  toScale: number,
  toRadius: number,
  duration: number,
  onComplete: () => void,
  overshoot: number = 1.3
) {
  const start = performance.now();

  function tick(now: number) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);

    // Damped spring: 1 - e^(-decay*t) * [cos(ω*t*s) + (decay/ωs)*sin(ω*t*s)]
    const omega = Math.PI * 2;
    const decay = 4.5;
    const springT =
      1 -
      Math.exp(-decay * t) *
        (Math.cos(omega * t * overshoot) +
          (decay / (omega * overshoot)) * Math.sin(omega * t * overshoot));

    const currentY = fromY + (toY - fromY) * springT;
    const currentScale = fromScale + (toScale - fromScale) * springT;
    const currentRadius = fromRadius + (toRadius - fromRadius) * springT;

    el.style.transform = `translateY(${currentY}px) scale(${currentScale})`;
    el.style.borderRadius = `${currentRadius}px`;

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      el.style.transform = `translateY(${toY}px) scale(${toScale})`;
      el.style.borderRadius = `${toRadius}px`;
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

export function MobileShell({ initialApp, initialNoteSlug }: MobileShellProps) {
  const [activeApp, setActiveApp] = useState<string | null>(initialApp || null);
  const [renderedApp, setRenderedApp] = useState<string | null>(
    initialApp || null
  );
  const [transition, setTransition] = useState<AppTransition>("idle");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [topmostTextEdit, setTopmostTextEdit] = useState<{
    filePath: string;
    content: string;
  } | null>(null);
  const [topmostPreview, setTopmostPreview] = useState<{
    filePath: string;
    fileUrl: string;
    fileType: PreviewFileType;
  } | null>(null);

  const appContainerRef = useRef<HTMLDivElement>(null);
  const homeContainerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchCurrentY = useRef(0);
  const touchTimestamp = useRef(0);
  const lastVelocity = useRef(0);
  const isGestureLocked = useRef(false);
  const isGestureRejected = useRef(false);
  const isDraggingRef = useRef(false);

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
      previewWindow?.metadata?.filePath &&
        previewWindow?.metadata?.fileUrl &&
        previewWindow?.metadata?.fileType
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
        setTimeout(() => setTransition("idle"), OPEN_DURATION);
      });
    });
  }, []);

  const handleGoHome = useCallback(() => {
    setTransition("closing");
    setTimeout(() => {
      setActiveApp(null);
      setRenderedApp(null);
      setTransition("idle");
    }, CLOSE_DURATION);
  }, []);

  const handleGestureDismiss = useCallback(() => {
    const el = appContainerRef.current;
    if (!el) {
      handleGoHome();
      return;
    }

    const currentTransform = el.style.transform;
    const yMatch = currentTransform.match(/translateY\(([-\d.]+)px\)/);
    const sMatch = currentTransform.match(/scale\(([-\d.]+)\)/);
    const currentY = yMatch ? parseFloat(yMatch[1]) : 0;
    const currentScale = sMatch ? parseFloat(sMatch[1]) : 1;
    const currentRadius = parseFloat(el.style.borderRadius) || 0;

    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transition = `opacity ${CLOSE_DURATION * 0.6}ms ease-out`;

    const targetY = window.innerHeight * 0.6;

    springAnimate(
      el,
      currentY,
      currentScale,
      currentRadius,
      targetY,
      0.85,
      44,
      CLOSE_DURATION,
      () => {
        setActiveApp(null);
        setRenderedApp(null);
        setTransition("idle");
        setIsDragging(false);
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
          el.style.borderRadius = "";
          el.style.opacity = "";
        }
      },
      0.4
    );
  }, [handleGoHome]);

  const handleGestureSnapBack = useCallback(() => {
    const el = appContainerRef.current;
    if (!el) return;

    const currentTransform = el.style.transform;
    const yMatch = currentTransform.match(/translateY\(([-\d.]+)px\)/);
    const sMatch = currentTransform.match(/scale\(([-\d.]+)\)/);
    const currentY = yMatch ? parseFloat(yMatch[1]) : 0;
    const currentScale = sMatch ? parseFloat(sMatch[1]) : 1;
    const currentRadius = parseFloat(el.style.borderRadius) || 0;

    el.style.transition = "none";
    el.style.opacity = "1";

    springAnimate(
      el,
      currentY,
      currentScale,
      currentRadius,
      0,
      1,
      0,
      380,
      () => {
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
          el.style.borderRadius = "";
        }
        setIsDragging(false);
      },
      1.6
    );
  }, []);

  const findScrollableParent = useCallback(
    (target: EventTarget | null): Element | null => {
      let el = target as Element | null;
      while (el && el !== appContainerRef.current) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    },
    []
  );

  const scrollableParentRef = useRef<Element | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (transition !== "idle" || !activeApp) return;

      const touch = e.touches[0];
      touchStartY.current = touch.clientY;
      touchStartX.current = touch.clientX;
      touchCurrentY.current = touch.clientY;
      touchTimestamp.current = performance.now();
      lastVelocity.current = 0;
      isGestureLocked.current = false;
      isGestureRejected.current = false;
      isDraggingRef.current = false;

      scrollableParentRef.current = findScrollableParent(e.target);
    },
    [transition, activeApp, findScrollableParent]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (transition !== "idle" || !activeApp || isGestureRejected.current)
        return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartY.current;
      const deltaX = touch.clientX - touchStartX.current;

      if (!isGestureLocked.current && !isDraggingRef.current) {
        const absDY = Math.abs(deltaY);
        const absDX = Math.abs(deltaX);

        if (absDY < 8 && absDX < 8) return;

        if (absDX > absDY * 1.2) {
          isGestureRejected.current = true;
          return;
        }

        if (
          scrollableParentRef.current &&
          scrollableParentRef.current.scrollTop > 1
        ) {
          isGestureRejected.current = true;
          return;
        }

        if (deltaY <= 0) {
          isGestureRejected.current = true;
          return;
        }

        isGestureLocked.current = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (!isGestureLocked.current) return;

      e.preventDefault();

      const now = performance.now();
      const dt = now - touchTimestamp.current;
      if (dt > 0) {
        lastVelocity.current =
          ((touch.clientY - touchCurrentY.current) / dt) * 1000;
      }
      touchTimestamp.current = now;
      touchCurrentY.current = touch.clientY;

      const dragDistance = Math.max(0, deltaY);
      const screenHeight = window.innerHeight;
      const resistedY = rubberBand(dragDistance, screenHeight, RUBBER_BAND_COEFF);

      const progress = Math.min(resistedY / (screenHeight * 0.4), 1);
      const scale = 1 - progress * 0.12;
      const radius = progress * 44;

      const el = appContainerRef.current;
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translateY(${resistedY}px) scale(${scale})`;
        el.style.borderRadius = `${radius}px`;
        el.style.overflow = "hidden";
      }

      const home = homeContainerRef.current;
      if (home) {
        const homeScale = 0.92 + progress * 0.08;
        const homeBlur = (1 - progress) * 8;
        home.style.transition = "none";
        home.style.transform = `scale(${homeScale})`;
        home.style.filter = `blur(${homeBlur}px)`;
        home.style.opacity = `${0.5 + progress * 0.5}`;
      }
    },
    [transition, activeApp]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isGestureLocked.current || !isDraggingRef.current) return;

    isDraggingRef.current = false;
    const deltaY = touchCurrentY.current - touchStartY.current;
    const velocity = lastVelocity.current;

    const home = homeContainerRef.current;
    if (home) {
      home.style.transition = `transform 400ms ${SPRING_BOUNCE}, filter 300ms ease-out, opacity 300ms ease-out`;
      home.style.transform = "";
      home.style.filter = "";
      home.style.opacity = "";
    }

    if (deltaY > DISMISS_THRESHOLD || velocity > VELOCITY_DISMISS) {
      handleGestureDismiss();
    } else {
      handleGestureSnapBack();
    }
  }, [handleGestureDismiss, handleGestureSnapBack]);

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

  const appTransitionStyle: React.CSSProperties = isDragging
    ? { transition: "none" }
    : {
        transition:
          transition === "opening"
            ? `transform ${OPEN_DURATION}ms ${SPRING_BOUNCE}, opacity 280ms ease-out, border-radius ${OPEN_DURATION}ms ${SPRING_BOUNCE}`
            : `transform ${CLOSE_DURATION}ms ${SPRING_DECEL}, opacity 220ms ease-in, border-radius ${CLOSE_DURATION}ms ${SPRING_DECEL}`,
        transform:
          transition === "closing"
            ? "scale(0.88) translateY(40px)"
            : transition === "opening" && activeApp !== renderedApp
              ? "scale(0.85) translateY(30px)"
              : "scale(1) translateY(0)",
        opacity:
          transition === "closing"
            ? 0
            : transition === "opening" && activeApp !== renderedApp
              ? 0
              : 1,
        borderRadius:
          transition === "closing" ||
          (transition === "opening" && activeApp !== renderedApp)
            ? "44px"
            : "0px",
      };

  return (
    <RecentsProvider>
      <div
        className="h-dvh relative overflow-hidden bg-black"
        style={{ overscrollBehavior: "none" }}
      >
        <div
          ref={homeContainerRef}
          className="absolute inset-0"
          style={{
            transform: isAppVisible && !isDragging ? "scale(0.92)" : undefined,
            filter: isAppVisible && !isDragging ? "blur(8px)" : undefined,
            opacity: isAppVisible && !isDragging ? 0.5 : 1,
            transition: `transform 400ms ${SPRING_BOUNCE}, filter 300ms ease-out, opacity 300ms ease-out`,
            willChange: isAppVisible ? "transform, filter, opacity" : undefined,
          }}
        >
          <IOSStatusBar variant={isOnHomeScreen ? "light" : "dark"} />
          <IOSHomeScreen onAppOpen={handleAppOpen} />
          <IOSHomeIndicator variant="light" />
        </div>

        {isAppVisible && (
          <div
            ref={appContainerRef}
            className="absolute inset-0 z-50 flex flex-col bg-background origin-top"
            style={{
              ...appTransitionStyle,
              willChange: "transform, border-radius, opacity",
              overflow: "hidden",
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <IOSStatusBar
              variant="dark"
              showBackButton
              onGoHome={handleGoHome}
            />
            <div
              className="flex-1 min-h-0 pt-[44px]"
              style={{ overscrollBehavior: "contain" }}
            >
              {renderedApp === "notes" && (
                <NotesApp
                  isMobile={true}
                  inShell={false}
                  initialSlug={initialNoteSlug}
                />
              )}
              {renderedApp === "messages" && (
                <MessagesApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "settings" && (
                <SettingsApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "iterm" && (
                <ITermApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "finder" && (
                <FinderApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "photos" && (
                <PhotosApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "calendar" && (
                <CalendarApp isMobile={true} inShell={false} />
              )}
              {renderedApp === "music" && <MusicApp isMobile={true} />}
              {renderedApp === "textedit" &&
                (() => {
                  const filePath = topmostTextEdit?.filePath;
                  const content =
                    topmostTextEdit?.content ??
                    (filePath ? getTextEditContent(filePath) ?? "" : "");
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
