export type ChatInputKeyEvent = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  keyCode?: number;
  isComposing?: boolean;
};

export type ChatInputKeyIntent = "submit" | "newline" | "ignore";

export function getChatInputKeyIntent(event: ChatInputKeyEvent): ChatInputKeyIntent {
  if (event.key !== "Enter") return "ignore";
  if (event.isComposing || event.keyCode === 229) return "ignore";
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return "newline";
  return "submit";
}
