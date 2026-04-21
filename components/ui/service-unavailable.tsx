import { cn } from "@/lib/utils";

interface ServiceUnavailableProps {
  title: string;
  description: string;
  tone?: "light" | "dark";
}

export function ServiceUnavailable({
  title,
  description,
  tone = "light",
}: ServiceUnavailableProps) {
  const isDark = tone === "dark";

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center p-6",
        isDark ? "bg-[#313338] text-white" : "bg-background text-foreground"
      )}
    >
      <div
        className={cn(
          "max-w-md rounded-lg border px-5 py-4 shadow-sm",
          isDark
            ? "border-white/10 bg-black/20"
            : "border-border bg-background/80"
        )}
      >
        <p className="text-sm font-semibold">{title}</p>
        <p
          className={cn(
            "mt-2 text-sm leading-6",
            isDark ? "text-white/75" : "text-muted-foreground"
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
