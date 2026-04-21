import type {
  LocalAgentCapability,
  LocalAgentDiffSummary,
  LocalAgentFolderSummary,
  LocalAgentModelRecommendation,
  LocalAgentToolEvent,
} from "./types";

export const DEFAULT_CAPABILITIES: LocalAgentCapability[] = [
  {
    id: "fs-access",
    label: "Folder access",
    status: "checking",
    detail: "Adapter-owned File System Access check; UI does not call picker APIs directly.",
  },
  {
    id: "webgpu",
    label: "WebGPU",
    status: "checking",
    detail: "Needed for practical Gemma-class browser inference.",
  },
  {
    id: "indexeddb",
    label: "IndexedDB storage",
    status: "checking",
    detail: "Sessions, logs, diffs, approvals, and retrieval indexes stay browser-local.",
  },
  {
    id: "commands",
    label: "Shell commands",
    status: "missing",
    detail: "Version 1 intentionally has no package-manager, Git, script-runner, model-runner, privileged, or terminal path.",
  },
];

export const DEFAULT_FOLDERS: LocalAgentFolderSummary[] = [
  {
    id: "code",
    name: "No code folder selected",
    role: "code",
    permission: "prompt",
  },
  {
    id: "materials",
    name: "No materials folder selected",
    role: "materials",
    permission: "prompt",
  },
  {
    id: "output",
    name: "No output folder selected",
    role: "output",
    permission: "prompt",
  },
];

export const DEFAULT_EVENTS: LocalAgentToolEvent[] = [
  {
    id: "diagnostics",
    title: "Readiness diagnostics queued",
    detail: "Browser, WebGPU, storage, CPU, and memory signals are checked before model selection.",
    status: "queued",
  },
  {
    id: "secret-policy",
    title: "Secret operation guard armed",
    detail: "Secret-like files require single-operation approval before read, edit, diff, RAG, log, or context use.",
    status: "blocked",
    approvalRequired: true,
  },
  {
    id: "command-policy",
    title: "Command request rejection ready",
    detail: "Requests for package-manager, Git, script-runner, model-runner, or terminal commands are explained as out of scope.",
    status: "complete",
  },
];

export const DEFAULT_DIFFS: LocalAgentDiffSummary[] = [
  {
    id: "diff-empty",
    filePath: "Select a folder to begin",
    summary: "Future edits appear here as reviewable browser-local change summaries before or after write operations.",
    additions: 0,
    deletions: 0,
    status: "draft",
  },
];

export const DEFAULT_MODEL_RECOMMENDATION: LocalAgentModelRecommendation = {
  tier: "2b",
  label: "Gemma 3 2B-class first",
  reason: "Default to the lighter local model until diagnostics prove WebGPU and memory headroom for a 4B-class option.",
  readiness: 42,
};
