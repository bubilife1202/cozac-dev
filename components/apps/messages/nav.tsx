import { Icons } from "./icons";
import { cn } from "@/lib/utils";
import { useWindowFocus } from "@/lib/window-focus-context";
import { WindowControls } from "@/components/window-controls";

interface NavProps {
  onResetChat: () => void;
  isMobileView: boolean;
  isScrolled?: boolean;
  isDesktop?: boolean;
}

export function Nav({ onResetChat, isMobileView, isScrolled, isDesktop = false }: NavProps) {
  const windowFocus = useWindowFocus();

  // When in desktop shell, use window controls from context
  const inShell = !!(isDesktop && windowFocus);

  return (
    <>
      <div
        className={cn(
          "px-4 py-2 flex items-center justify-between sticky top-0 z-[1] select-none",
          isScrolled && "border-b shadow-[0_2px_4px_-1px_rgba(0,0,0,0.15)]",
          isMobileView ? "bg-background" : "bg-muted",
        )}
        onMouseDown={inShell ? windowFocus?.onDragStart : undefined}
      >
        <WindowControls
          inShell={inShell}
          showWhenNotInShell={!isDesktop}
          className="p-2"
          onClose={inShell ? windowFocus?.closeWindow : !isDesktop ? () => window.close() : undefined}
          onMinimize={inShell ? windowFocus?.minimizeWindow : undefined}
          onToggleMaximize={inShell ? windowFocus?.toggleMaximize : undefined}
          isMaximized={windowFocus?.isMaximized ?? false}
          closeLabel={inShell ? "Close window" : "Close tab"}
        />
        <button
          className={`sm:p-2 hover:bg-muted-foreground/10 rounded-lg ${
            isMobileView ? "p-2" : ""
          }`}
          onClick={onResetChat}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Reset chat"
        >
          <Icons.trash />
        </button>
      </div>
    </>
  );
}
