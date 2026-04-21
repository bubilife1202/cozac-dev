import type { LocalFileAdapter, ToolEvent } from "./types";

export const COMMAND_EXECUTION_UNAVAILABLE_MESSAGE =
  "Local Agent v1 is browser-native: it can inspect and edit approved files, but it cannot run shell commands, daemons, localhost bridges, git, npm, python, ollama, sudo, or other OS processes.";

const COMMAND_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(test|run|build|dev|install|exec)\b/i,
  /\b(git|python|python3|pip|node|ollama|sudo|bash|zsh|sh)\b/i,
  /\b(shell|terminal|command line|localhost|daemon)\b/i,
];

function makeEvent(kind: ToolEvent["kind"], summary: string, path?: string): ToolEvent {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    kind,
    path,
    createdAt: new Date().toISOString(),
    summary,
  };
}

export function isCommandExecutionRequest(prompt: string): boolean {
  return COMMAND_PATTERNS.some((pattern) => pattern.test(prompt));
}

export async function runLocalAgentTurn(
  prompt: string,
  adapter?: LocalFileAdapter,
): Promise<{ status: "rejected" | "ready"; message: string; events: ToolEvent[] }> {
  if (isCommandExecutionRequest(prompt)) {
    return {
      status: "rejected",
      message: COMMAND_EXECUTION_UNAVAILABLE_MESSAGE,
      events: [makeEvent("reject-command", "Rejected shell/command execution request")],
    };
  }

  if (!adapter) {
    return {
      status: "ready",
      message: "Local Agent is ready for selected-folder file operations.",
      events: [],
    };
  }

  const entries = await adapter.listEntries();
  return {
    status: "ready",
    message: `Local Agent can see ${entries.length} selected-folder entr${entries.length === 1 ? "y" : "ies"}.`,
    events: [makeEvent("list", `Listed ${entries.length} selected-folder entries`)],
  };
}
