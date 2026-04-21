"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Diff, FolderPlus, MessageSquareText, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BrowserFolderAdapter,
  createLineDiffSummary,
  isCommandExecutionRequest,
  isSecretLikePath,
  openLocalAiDatabase,
  probeLocalAiCapabilities,
  putLocalAiRecord,
  recommendLocalModel,
  runLocalAgentTurn,
} from "@/lib/local-ai";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_DIFFS,
  DEFAULT_EVENTS,
  DEFAULT_FOLDERS,
  DEFAULT_MODEL_RECOMMENDATION,
} from "./fixtures";
import type {
  LocalAgentAppProps,
  LocalAgentCapabilityStatus,
  LocalAgentModelRecommendation,
  LocalAgentToolEvent,
  LocalAgentFolderRole,
  LocalAgentPermissionState,
  LocalAgentWorkbenchState,
} from "./types";

const ROLE_COPY: Record<LocalAgentFolderRole, { label: string; description: string }> = {
  code: {
    label: "Code",
    description: "Source files the agent may inspect or edit after approval rules pass.",
  },
  materials: {
    label: "Materials",
    description: "Notes, docs, CSV, JSON, Markdown, and text used for browser-local RAG.",
  },
  output: {
    label: "Output",
    description: "Drafts and generated files; never auto-created as hidden project state.",
  },
};

const PERMISSION_COPY: Record<LocalAgentPermissionState, string> = {
  granted: "Granted",
  prompt: "Needs selection",
  denied: "Denied",
  unknown: "Unknown",
};

function mergeWorkbenchState(state?: Partial<LocalAgentWorkbenchState>): LocalAgentWorkbenchState {
  return {
    capabilities: state?.capabilities ?? DEFAULT_CAPABILITIES,
    folders: state?.folders ?? DEFAULT_FOLDERS,
    events: state?.events ?? DEFAULT_EVENTS,
    diffs: state?.diffs ?? DEFAULT_DIFFS,
    modelRecommendation: state?.modelRecommendation ?? DEFAULT_MODEL_RECOMMENDATION,
  };
}

function statusLabel(status: LocalAgentCapabilityStatus): string {
  if (status === "supported") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "missing") return "Unavailable";
  return "Checking";
}

function makeUiId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function truncatePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact || "(empty file)";
}

function parseReadPath(prompt: string): string | null {
  return prompt.match(/^read\s*:?\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function parseWriteRequest(prompt: string): { path: string; text: string } | null {
  const colonMatch = prompt.match(/^write\s+([^:\n]+)\s*:\s*([\s\S]+)$/i);
  if (colonMatch) {
    return { path: colonMatch[1].trim(), text: colonMatch[2] };
  }

  const newlineMatch = prompt.match(/^write\s+([^\n]+)\n([\s\S]+)$/i);
  if (newlineMatch) {
    return { path: newlineMatch[1].trim(), text: newlineMatch[2] };
  }

  return null;
}

function capabilityStatus(ready: boolean, partial = false): LocalAgentCapabilityStatus {
  if (ready) return "supported";
  return partial ? "partial" : "missing";
}

function toUiModelRecommendation(recommendation: ReturnType<typeof recommendLocalModel>): LocalAgentModelRecommendation {
  const readiness = recommendation.tier === "gemma-3-270m-it"
    ? recommendation.status === "ready" ? 62 : 46
    : recommendation.tier === "gemma-3-4b" ? 82
      : recommendation.status === "ready" ? 58 : recommendation.status === "degraded" ? 38 : 8;

  return {
    tier: recommendation.tier === "gemma-3-4b" ? "4b" : recommendation.tier === "gemma-3-2b" ? "2b" : recommendation.tier === "gemma-3-270m-it" ? "270m" : "unsupported",
    label: recommendation.label,
    reason: recommendation.reasons.join(" "),
    readiness,
  };
}

function createCapabilityCards(): {
  capabilities: LocalAgentWorkbenchState["capabilities"];
  recommendation: LocalAgentModelRecommendation;
} {
  const signals = probeLocalAiCapabilities();
  const recommendation = recommendLocalModel(signals);

  return {
    recommendation: toUiModelRecommendation(recommendation),
    capabilities: [
      {
        id: "fs-access",
        label: "Folder access",
        status: capabilityStatus(signals.fileSystemAccess),
        detail: signals.fileSystemAccess
          ? "Directory picker is available; folder access still requires a user gesture."
          : "This browser does not expose selected-folder access. Use Chromium desktop for full Local Mode.",
      },
      {
        id: "webgpu",
        label: "WebGPU",
        status: capabilityStatus(signals.webGPU, true),
        detail: signals.webGPU
          ? "WebGPU is available for browser-local model runtimes."
          : "WebGPU is unavailable; Gemma 270M can still load through WASM with degraded speed and no cloud fallback.",
      },
      {
        id: "indexeddb",
        label: "IndexedDB storage",
        status: capabilityStatus(signals.indexedDB),
        detail: signals.indexedDB
          ? "Browser-local stores can hold sessions, logs, diffs, approvals, and retrieval metadata."
          : "IndexedDB is required; private-mode/quota failures are shown instead of using a server.",
      },
      {
        id: "device",
        label: `${signals.browserName} on ${signals.osHint}`,
        status: signals.webGPU ? "supported" : "partial",
        detail: `${signals.cpuCores ?? "unknown"} CPU cores, ${signals.memoryGB ?? "unknown"} GB memory signal.`,
      },
      {
        id: "commands",
        label: "Shell commands",
        status: "missing",
        detail: "Version 1 intentionally rejects npm, git, python, ollama, sudo, and shell requests.",
      },
    ],
  };
}

type PendingSecretOperation = {
  role: LocalAgentFolderRole;
  path: string;
  operation: "read" | "write";
  nextText?: string;
};

const RUNNABLE_LOCAL_MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX";
const RUNNABLE_LOCAL_MODEL_LABEL = "Gemma 3 270M local smoke model";

type LocalModelUiStatus = "idle" | "loading" | "ready" | "generating" | "error";

type LocalModelUiState = {
  status: LocalModelUiStatus;
  message: string;
  progress?: number;
  answer?: string;
  error?: string;
};

type LocalModelProgressInput = {
  status?: string;
  message?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type LocalModelLoadOptions = {
  modelId: string;
  onProgress?: (progress: unknown) => void;
};

type LocalModelGenerateOptions = {
  prompt: string;
  modelId: string;
  model?: unknown;
  session?: unknown;
  localContext?: string;
  onProgress?: (progress: unknown) => void;
};

type LocalModelLoader = (options: LocalModelLoadOptions) => Promise<unknown>;
type LocalModelGenerator = (options: LocalModelGenerateOptions) => Promise<unknown>;

type LocalModelEngineModule = Record<string, unknown>;

type ResolvedLocalModelEngine = {
  load: LocalModelLoader;
  generate: LocalModelGenerator;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function getNumber(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function normalizeProgressPercent(progress: LocalModelProgressInput): number | undefined {
  const rawProgress = progress.progress;
  if (typeof rawProgress === "number" && Number.isFinite(rawProgress)) {
    const percent = rawProgress <= 1 ? rawProgress * 100 : rawProgress;
    return Math.min(Math.max(Math.round(percent), 0), 100);
  }

  if (
    typeof progress.loaded === "number" &&
    typeof progress.total === "number" &&
    Number.isFinite(progress.loaded) &&
    Number.isFinite(progress.total) &&
    progress.total > 0
  ) {
    return Math.min(Math.max(Math.round((progress.loaded / progress.total) * 100), 0), 100);
  }

  return undefined;
}

function describeModelProgress(progress: unknown): Pick<LocalModelUiState, "message" | "progress"> {
  if (!isRecord(progress)) {
    return { message: "Loading browser-local model assets..." };
  }

  const progressInput: LocalModelProgressInput = {
    status: getString(progress, ["status", "task"]),
    message: getString(progress, ["message", "detail"]),
    file: getString(progress, ["file", "name"]),
    progress: getNumber(progress, ["progress", "percentage"]),
    loaded: getNumber(progress, ["loaded", "loadedBytes"]),
    total: getNumber(progress, ["total", "totalBytes"]),
  };
  const message =
    progressInput.message ??
    (progressInput.file ? `Loading ${progressInput.file}` : undefined) ??
    progressInput.status ??
    "Loading browser-local model assets...";

  return {
    message,
    progress: normalizeProgressPercent(progressInput),
  };
}

function pickFunction(module: LocalModelEngineModule, names: string[]): unknown {
  for (const name of names) {
    const candidate = module[name];
    if (typeof candidate === "function") {
      return candidate;
    }
  }
  return undefined;
}

async function resolveLocalModelEngine(): Promise<ResolvedLocalModelEngine> {
  const engineModule = (await import("@/lib/local-ai/model-engine")) as unknown as LocalModelEngineModule;
  const load = pickFunction(engineModule, [
    "loadBrowserLocalModel",
    "loadLocalModel",
    "loadLocalModelEngine",
    "loadLocalGemmaModel",
  ]);
  const generate = pickFunction(engineModule, [
    "generateBrowserLocalAnswer",
    "generateLocalModelAnswer",
    "generateLocalAnswer",
    "answerWithLocalModel",
  ]);

  if (typeof load !== "function" || typeof generate !== "function") {
    throw new Error(
      "Local model engine is not ready yet: expected browser-local load and generate exports from lib/local-ai/model-engine.",
    );
  }

  return {
    load: load as LocalModelLoader,
    generate: generate as LocalModelGenerator,
  };
}

function extractModelAnswer(output: unknown): string {
  if (typeof output === "string") {
    return output.trim();
  }

  if (Array.isArray(output) && output.length > 0) {
    return extractModelAnswer(output[0]);
  }

  if (isRecord(output)) {
    const text = getString(output, ["answer", "text", "generated_text", "output_text", "response"]);
    if (text) {
      return text.trim();
    }

    const first = output[0];
    if (first) {
      return extractModelAnswer(first);
    }
  }

  return "The local model returned an empty response.";
}

export function LocalAgentApp({
  isMobile = false,
  inShell = false,
  state,
  onSelectFolder,
  onSubmitPrompt,
  onReviewSecretOperation,
}: LocalAgentAppProps) {
  const externalWorkbench = useMemo(() => mergeWorkbenchState(state), [state]);
  const [workbench, setWorkbench] = useState<LocalAgentWorkbenchState>(externalWorkbench);
  const [selectedRole, setSelectedRole] = useState<LocalAgentFolderRole>("code");
  const [prompt, setPrompt] = useState("Inspect the selected folder and propose the smallest safe change.");
  const [adapterNotice, setAdapterNotice] = useState<string | null>(null);
  const [modelRun, setModelRun] = useState<LocalModelUiState>({
    status: "idle",
    message: `${RUNNABLE_LOCAL_MODEL_LABEL} is ready to download into this browser tab.`,
  });
  const adaptersRef = useRef<Partial<Record<LocalAgentFolderRole, BrowserFolderAdapter>>>({});
  const pendingSecretsRef = useRef<Record<string, PendingSecretOperation>>({});
  const modelEngineRef = useRef<ResolvedLocalModelEngine | null>(null);
  const modelSessionRef = useRef<unknown>(null);

  useEffect(() => {
    if (state) {
      setWorkbench(externalWorkbench);
    }
  }, [externalWorkbench, state]);

  useEffect(() => {
    if (state) return;

    const { capabilities, recommendation } = createCapabilityCards();
    setWorkbench((current) => ({
      ...current,
      capabilities,
      modelRecommendation: recommendation,
    }));


    void openLocalAiDatabase()
      .then((database) => {
        database.close();
        setAdapterNotice("IndexedDB local stores are ready; no Local Agent state is sent to the server.");
      })
      .catch((error: unknown) => {
        setAdapterNotice(error instanceof Error ? error.message : "IndexedDB is unavailable for Local Agent state.");
      });
  }, [state]);

  const selectedFolder = useMemo(
    () => workbench.folders.find((folder) => folder.role === selectedRole) ?? workbench.folders[0],
    [selectedRole, workbench.folders]
  );


  const persistRecord = useCallback((storeName: "toolEvents" | "diffs" | "diagnostics", record: Record<string, unknown> & { id: string }) => {
    void putLocalAiRecord(storeName, record).catch(() => {
      // The UI remains fully local even when durable storage is unavailable.
    });
  }, []);

  const addEvent = useCallback(
    (event: Omit<LocalAgentToolEvent, "id"> & { id?: string }): LocalAgentToolEvent => {
      const nextEvent: LocalAgentToolEvent = {
        id: event.id ?? makeUiId("event"),
        ...event,
      };

      setWorkbench((current) => ({
        ...current,
        events: [nextEvent, ...current.events].slice(0, 12),
      }));
      persistRecord("toolEvents", { ...nextEvent, createdAt: new Date().toISOString() });
      return nextEvent;
    },
    [persistRecord]
  );

  const updateFolder = useCallback((role: LocalAgentFolderRole, patch: Partial<LocalAgentWorkbenchState["folders"][number]>) => {
    setWorkbench((current) => ({
      ...current,
      folders: current.folders.map((folder) => (folder.role === role ? { ...folder, ...patch } : folder)),
    }));
  }, []);

  const handleSelectFolder = useCallback(
    async (role: LocalAgentFolderRole) => {
      setSelectedRole(role);

      if (onSelectFolder) {
        await onSelectFolder(role);
        return;
      }

      try {
        const adapter = await BrowserFolderAdapter.chooseFolder();
        adaptersRef.current[role] = adapter;
        const entries = await adapter.listEntries();
        updateFolder(role, {
          name: adapter.getRootName(),
          permission: "granted",
          itemCount: entries.length,
          lastIndexedLabel: new Date().toLocaleTimeString(),
        });
        addEvent({
          title: `${ROLE_COPY[role].label} folder selected`,
          detail: `Listed ${entries.length} top-level selected-folder entries. No other OS paths were probed.`,
          status: "complete",
        });
        setAdapterNotice(`Selected ${adapter.getRootName()} as ${ROLE_COPY[role].label.toLowerCase()} folder.`);
      } catch (error) {
        updateFolder(role, { permission: "denied" });
        addEvent({
          title: "Folder selection unavailable",
          detail: error instanceof Error ? error.message : "The browser denied or lacks folder selection.",
          status: "blocked",
        });
      }
    },
    [addEvent, onSelectFolder, updateFolder]
  );

  const appendDiff = useCallback(
    (filePath: string, previousText: string, nextText: string) => {
      const summary = createLineDiffSummary(previousText, nextText, filePath);
      const diffRecord = {
        id: makeUiId("diff"),
        filePath,
        summary: summary.summary,
        additions: summary.addedLines,
        deletions: summary.deletedLines,
        status: "applied" as const,
      };

      setWorkbench((current) => ({
        ...current,
        diffs: [diffRecord, ...current.diffs].slice(0, 8),
      }));
      persistRecord("diffs", diffRecord);
    },
    [persistRecord]
  );

  const readPath = useCallback(
    async (path: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before reading files.`);
        return;
      }

      const read = await adapter.readTextFile(path, approvalId);
      addEvent({
        title: `Read ${read.path}`,
        detail: `Loaded ${read.size} bytes locally. Preview: ${truncatePreview(read.text)}`,
        status: "complete",
        filePath: read.path,
      });
    },
    [addEvent, selectedRole]
  );

  const writePath = useCallback(
    async (path: string, nextText: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before writing files.`);
        return;
      }

      const write = await adapter.writeTextFile(path, nextText, approvalId);
      appendDiff(write.path, write.previousText, write.nextText);
      addEvent({
        title: `Wrote ${write.path}`,
        detail: "Applied the write through the selected-folder adapter and recorded a local diff summary.",
        status: "complete",
        filePath: write.path,
      });
    },
    [addEvent, appendDiff, selectedRole]
  );

  const blockSecret = useCallback(
    (operation: PendingSecretOperation) => {
      const event = addEvent({
        title: `Secret ${operation.operation} approval required`,
        detail: `${operation.path} looks secret-like. Approve this single operation before content is exposed or modified.`,
        status: "blocked",
        filePath: operation.path,
        approvalRequired: true,
      });
      pendingSecretsRef.current[event.id] = operation;
    },
    [addEvent]
  );

  const handleModelProgress = useCallback((progress: unknown, status: "loading" | "generating") => {
    const nextProgress = describeModelProgress(progress);
    setModelRun((current) => ({
      ...current,
      status,
      message: nextProgress.message,
      progress: nextProgress.progress ?? current.progress,
      error: undefined,
    }));
  }, []);

  const handleLoadModel = useCallback(async () => {
    setModelRun({
      status: "loading",
      message: `Preparing ${RUNNABLE_LOCAL_MODEL_LABEL}; model files stay in the browser cache/runtime.`,
      progress: 0,
    });

    try {
      const engine = modelEngineRef.current ?? (await resolveLocalModelEngine());
      modelEngineRef.current = engine;
      const session = await engine.load({
        modelId: RUNNABLE_LOCAL_MODEL_ID,
        onProgress: (progress: unknown) => handleModelProgress(progress, "loading"),
      });
      modelSessionRef.current = session;
      setModelRun((current) => ({
        ...current,
        status: "ready",
        message: `${RUNNABLE_LOCAL_MODEL_LABEL} is loaded locally. Prompts now generate in this browser tab.`,
        progress: 100,
        error: undefined,
      }));
      addEvent({
        title: "Local model loaded",
        detail: `${RUNNABLE_LOCAL_MODEL_ID} loaded through the browser-local model engine. No chat route, localhost bridge, or cloud fallback was used by the UI.`,
        status: "complete",
      });
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The browser-local model engine failed to load.";
      setModelRun({
        status: "error",
        message: "Local model did not load.",
        error: message,
      });
      addEvent({
        title: "Local model load failed",
        detail: message,
        status: "blocked",
      });
      throw error;
    }
  }, [addEvent, handleModelProgress]);

  const answerWithLocalModel = useCallback(
    async (userPrompt: string, localContext?: string) => {
      const engine = modelEngineRef.current ?? (await resolveLocalModelEngine());
      modelEngineRef.current = engine;
      const session = modelSessionRef.current ?? (await handleLoadModel());

      setModelRun((current) => ({
        ...current,
        status: "generating",
        message: "Generating with the browser-local model...",
        error: undefined,
      }));

      const output = await engine.generate({
        prompt: userPrompt,
        modelId: RUNNABLE_LOCAL_MODEL_ID,
        model: session,
        session,
        localContext,
        onProgress: (progress: unknown) => handleModelProgress(progress, "generating"),
      });
      const answer = extractModelAnswer(output);

      setModelRun((current) => ({
        ...current,
        status: "ready",
        message: "Local answer generated in this browser tab.",
        progress: 100,
        answer,
        error: undefined,
      }));
      addEvent({
        title: "Local model answered",
        detail: truncatePreview(answer),
        status: "complete",
      });
    },
    [addEvent, handleLoadModel, handleModelProgress]
  );

  const handleSubmitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setAdapterNotice("Write a local task first; empty prompts are not sent anywhere.");
      return;
    }

    if (onSubmitPrompt) {
      await onSubmitPrompt(trimmed);
      return;
    }

    if (isCommandExecutionRequest(trimmed)) {
      const adapter = adaptersRef.current[selectedRole];
      const result = await runLocalAgentTurn(trimmed, adapter);
      addEvent({ title: "Command request rejected", detail: result.message, status: "blocked" });
      return;
    }

    const readTarget = parseReadPath(trimmed);
    const writeTarget = parseWriteRequest(trimmed);


    try {
      if (readTarget) {
        const adapter = adaptersRef.current[selectedRole];
        if (!adapter) {
          setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before reading files. The prompt stayed in this tab.`);
          return;
        }
        if (isSecretLikePath(readTarget)) {
          blockSecret({ role: selectedRole, path: readTarget, operation: "read" });
          return;
        }
        await readPath(readTarget);
        return;
      }

      if (writeTarget) {
        const adapter = adaptersRef.current[selectedRole];
        if (!adapter) {
          setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before writing files. The prompt stayed in this tab.`);
          return;
        }
        if (isSecretLikePath(writeTarget.path)) {
          blockSecret({ role: selectedRole, path: writeTarget.path, operation: "write", nextText: writeTarget.text });
          return;
        }
        await writePath(writeTarget.path, writeTarget.text);
        return;
      }

      const context = selectedFolder
        ? `${ROLE_COPY[selectedRole].label} folder: ${selectedFolder.name}; permission: ${selectedFolder.permission}; indexed entries: ${selectedFolder.itemCount ?? "unknown"}.`
        : undefined;
      await answerWithLocalModel(trimmed, context);
    } catch (error) {
      addEvent({
        title: "Local task failed",
        detail: error instanceof Error ? error.message : "Unknown local adapter or model failure.",
        status: "blocked",
      });
    }
  }, [addEvent, answerWithLocalModel, blockSecret, onSubmitPrompt, prompt, readPath, selectedFolder, selectedRole, writePath]);

  const handleReviewSecret = useCallback(
    async (eventId: string) => {
      if (onReviewSecretOperation) {
        await onReviewSecretOperation(eventId);
        return;
      }

      const operation = pendingSecretsRef.current[eventId];
      const adapter = operation ? adaptersRef.current[operation.role] : undefined;
      if (!operation || !adapter) {
        setAdapterNotice("No pending secret operation was found for this approval card.");
        return;
      }

      try {
        if (operation.operation === "read") {
          const approvalId = adapter.approveSecretRead(operation.path, "User approved this single Local Agent read operation.");
          await readPath(operation.path, approvalId);
        } else {
          const approvalId = adapter.approveSecretWrite(operation.path, "User approved this single Local Agent write operation.");
          await writePath(operation.path, operation.nextText ?? "", approvalId);
        }
        delete pendingSecretsRef.current[eventId];
      } catch (error) {
        setAdapterNotice(error instanceof Error ? error.message : "Secret approval operation failed.");
      }
    },
    [onReviewSecretOperation, readPath, writePath]
  );

  const modelBusy = modelRun.status === "loading" || modelRun.status === "generating";
  const modelReady = modelRun.status === "ready";
  const visibleEvents = workbench.events.slice(0, 6);
  const visibleDiffs = workbench.diffs.slice(0, 3);

  return (
    <div
      data-app="local-ai"
      data-mobile={isMobile ? "true" : "false"}
      data-shell={inShell ? "true" : "false"}
      className="h-full w-full overflow-hidden bg-[#f4efe4] text-[#17120b] dark:bg-[#15120d] dark:text-[#f7efe1]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-black/10 bg-[#fbf6ea]/90 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#1d1811]/90">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a6b2e] dark:text-[#d5b66a]">Local-only agent</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Local Agent</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700 dark:text-emerald-200">No cloud fallback</span>
            <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-medium text-stone-700 dark:border-white/10 dark:bg-white/10 dark:text-stone-200">{modelReady ? "Model ready" : modelBusy ? "Model loading" : "Model idle"}</span>
          </div>
        </header>

        <main className={cn("grid min-h-0 flex-1 gap-4 p-4", isMobile ? "grid-cols-1 overflow-auto" : "grid-cols-[300px_minmax(0,1fr)]") }>
          <aside className="flex min-h-0 flex-col gap-4 overflow-auto rounded-[28px] border border-black/10 bg-[#fffaf0] p-4 shadow-sm dark:border-white/10 dark:bg-[#211b13]">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Model</div>
                  <div className="mt-1 font-semibold">Gemma 270M</div>
                </div>
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              <button
                type="button"
                onClick={() => void handleLoadModel().catch(() => undefined)}
                disabled={modelBusy}
                className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#17120b] px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#f5deb0] dark:text-[#17120b]"
              >
                {modelReady ? "Reload local model" : modelBusy ? "Loading..." : "Download / load model"}
              </button>
              <div className="mt-3 rounded-2xl bg-black/[0.04] p-3 text-xs leading-relaxed text-stone-600 dark:bg-white/[0.06] dark:text-stone-300">
                <div className="flex items-center justify-between gap-3 font-medium uppercase tracking-[0.14em]">
                  <span>{modelRun.status}</span>
                  {typeof modelRun.progress === "number" && <span>{modelRun.progress}%</span>}
                </div>
                {typeof modelRun.progress === "number" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(Math.max(modelRun.progress, 0), 100)}%` }} />
                  </div>
                )}
                <p className="mt-2">{modelRun.error ?? modelRun.message}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                2B E2B is verified by CLI proof. The web UI keeps 270M as the quick browser smoke model for now.
              </p>
            </section>

            <section className="border-t border-black/10 pt-4 dark:border-white/10">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Workspace</div>
              <div className="grid gap-2">
                {workbench.folders.map((folder) => {
                  const selected = selectedRole === folder.role;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedRole(folder.role)}
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-left transition",
                        selected
                          ? "border-[#17120b] bg-[#17120b] text-white dark:border-[#f5deb0] dark:bg-[#f5deb0] dark:text-[#17120b]"
                          : "border-black/10 bg-white/60 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                        <span>{ROLE_COPY[folder.role].label}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">{PERMISSION_COPY[folder.permission]}</span>
                      </div>
                      <div className="mt-1 truncate text-xs opacity-75">{folder.name}</div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void handleSelectFolder(selectedRole)}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
                <FolderPlus className="h-4 w-4" />
                Select {ROLE_COPY[selectedRole].label.toLowerCase()} folder
              </button>
            </section>

            <section className="border-t border-black/10 pt-4 dark:border-white/10">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Readiness</div>
              <div className="grid gap-2">
                {workbench.capabilities.slice(0, 4).map((capability) => (
                  <div key={capability.id} className="rounded-2xl bg-black/[0.04] px-3 py-2 text-xs dark:bg-white/[0.05]">
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span>{capability.label}</span>
                      <span>{statusLabel(capability.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-black/10 bg-[#fffdf8] shadow-sm dark:border-white/10 dark:bg-[#1e1912]">
            <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Conversation</div>
              <div className="mt-1 text-lg font-semibold tracking-[-0.02em]">Talk to the local model, or ask it to work with selected files.</div>
            </div>

            <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
              <div className="space-y-4 p-5">
                <div className="max-w-[760px] rounded-[26px] bg-[#f1eadc] p-4 text-sm leading-relaxed text-stone-700 dark:bg-white/[0.07] dark:text-stone-200">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">Local Agent</div>
                  Load the model, then type naturally. Use <span className="font-semibold">read README.md</span> or <span className="font-semibold">write notes/demo.txt: hello</span> when you want folder tools.
                </div>

                {modelRun.answer && (
                  <div className="ml-auto max-w-[760px] rounded-[26px] bg-[#17120b] p-4 text-sm leading-relaxed text-white dark:bg-[#f5deb0] dark:text-[#17120b]">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Latest answer</div>
                    <p className="whitespace-pre-wrap">{modelRun.answer}</p>
                  </div>
                )}

                {adapterNotice && (
                  <div className="max-w-[760px] rounded-[22px] border border-amber-500/25 bg-amber-100/70 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                    {adapterNotice}
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[24px] bg-black/[0.035] p-4 dark:bg-white/[0.05]">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4" /> Activity</div>
                    <div className="space-y-2">
                      {visibleEvents.map((event) => (
                        <div key={event.id} className="rounded-2xl bg-white/70 p-3 text-xs leading-relaxed dark:bg-black/20">
                          <div className="flex items-center justify-between gap-2 font-semibold">
                            <span>{event.title}</span>
                            <span className="uppercase tracking-[0.12em] opacity-60">{event.status}</span>
                          </div>
                          <p className="mt-1 opacity-70">{event.detail}</p>
                          {event.approvalRequired && (
                            <button type="button" onClick={() => void handleReviewSecret(event.id)} className="mt-2 rounded-full border border-black/10 px-3 py-1 font-semibold dark:border-white/10">Approve once</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] bg-black/[0.035] p-4 dark:bg-white/[0.05]">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Diff className="h-4 w-4" /> File changes</div>
                    <div className="space-y-2">
                      {visibleDiffs.map((diff) => (
                        <div key={diff.id} className="rounded-2xl bg-white/70 p-3 text-xs leading-relaxed dark:bg-black/20">
                          <div className="font-semibold">{diff.filePath}</div>
                          <p className="mt-1 opacity-70">{diff.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className={cn("border-t border-black/10 bg-[#fbf6ea] p-4 dark:border-white/10 dark:bg-[#18140f]", inShell ? "pb-24" : "")}>
              <div className="flex gap-3">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[76px] flex-1 resize-none rounded-3xl border-black/10 bg-white/80 p-4 text-base shadow-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-white/10 dark:bg-white/[0.06]"
                  placeholder="Ask a question, or try read README.md"
                />
                <button
                  type="button"
                  onClick={() => void handleSubmitPrompt()}
                  className="min-h-[76px] rounded-3xl bg-amber-500 px-5 text-sm font-bold text-[#17120b] transition hover:scale-[1.02]"
                >
                  Run
                </button>
              </div>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Everything here stays in this browser tab unless you explicitly choose a folder.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export const LocalAiApp = LocalAgentApp;

export function LocalAgentEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f6f1e7] p-6 text-center text-stone-950 dark:bg-[#11100d] dark:text-stone-50">
      <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      <div className="max-w-sm text-lg font-semibold">Local Agent UI is ready for host integration.</div>
      <p className="max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        Wire this component to the browser-folder adapter and local agent core; it intentionally contains no raw folder picker, existing Messages sender, server chat route, or command execution path.
      </p>
    </div>
  );
}
