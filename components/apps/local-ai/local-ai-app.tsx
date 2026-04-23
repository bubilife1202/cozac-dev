"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Atom, CheckCircle2, ChevronRight, Code2, Download, Folder, LockKeyhole, Send, Settings, Zap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWindowFocus } from "@/lib/window-focus-context";
import { WindowControls } from "@/components/window-controls";
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

function mergeWorkbenchState(state?: Partial<LocalAgentWorkbenchState>): LocalAgentWorkbenchState {
  return {
    capabilities: state?.capabilities ?? DEFAULT_CAPABILITIES,
    folders: state?.folders ?? DEFAULT_FOLDERS,
    events: state?.events ?? DEFAULT_EVENTS,
    diffs: state?.diffs ?? DEFAULT_DIFFS,
    modelRecommendation: state?.modelRecommendation ?? DEFAULT_MODEL_RECOMMENDATION,
  };
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
  const readiness = recommendation.tier === "gemma-4-e4b"
    ? 86
    : recommendation.tier === "gemma-4-e2b"
      ? 72
      : recommendation.tier === "gemma-3-270m-it"
        ? recommendation.status === "ready" ? 48 : 34
        : 8;

  return {
    tier: recommendation.tier === "gemma-4-e4b" ? "e4b" : recommendation.tier === "gemma-4-e2b" ? "e2b" : recommendation.tier === "gemma-3-270m-it" ? "fallback" : "unsupported",
    label: recommendation.label,
    reason: recommendation.reasons.join(" "),
    readiness,
  };
}

function createCapabilityCards(): {
  capabilities: LocalAgentWorkbenchState["capabilities"];
  recommendation: LocalAgentModelRecommendation;
  signals: ReturnType<typeof probeLocalAiCapabilities>;
} {
  const signals = probeLocalAiCapabilities();
  const recommendation = recommendLocalModel(signals);

  return {
    recommendation: toUiModelRecommendation(recommendation),
    signals,
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
        label: "Browser storage",
        status: capabilityStatus(signals.indexedDB),
        detail: signals.indexedDB
          ? "Browser-local stores can hold sessions, logs, diffs, approvals, and retrieval metadata."
          : "Browser storage is required; private-mode/quota failures are shown instead of using a server.",
      },
      {
        id: "device",
        label: `${signals.browserName} on ${signals.osHint}`,
        status: signals.webGPU ? "supported" : "partial",
        detail: `${signals.cpuCores ?? "unknown"} CPU cores, ${typeof signals.memoryGB === "number" ? `${signals.memoryGB} GB memory signal` : "desktop browser does not expose exact RAM"}.`,
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

type DeviceSuitability = {
  verdict: "good" | "mixed" | "blocked";
  headline: string;
  body: string;
  chips: string[];
};

function buildDeviceSuitability(
  signals: ReturnType<typeof probeLocalAiCapabilities>,
  recommendation: LocalAgentModelRecommendation,
): DeviceSuitability {
  const chips = [
    `${signals.browserName} · ${signals.osHint}`,
    `${signals.cpuCores ?? "?"} CPU cores`,
    typeof signals.memoryGB === "number" ? `${signals.memoryGB} GB memory signal` : "RAM hidden by browser",
    signals.webGPU ? "WebGPU on" : "WebGPU off",
    signals.fileSystemAccess ? "Folder access on" : "Folder access off",
  ];

  if (!signals.fileSystemAccess || !signals.indexedDB) {
    return {
      verdict: "blocked",
      headline: "로컬 폴더/저장소 권한이 먼저 필요합니다",
      body: "이 브라우저에서는 폴더 선택이나 브라우저 저장소가 막혀 있어서 Local Agent를 제대로 쓸 수 없습니다.",
      chips,
    };
  }

  if (recommendation.tier === "e4b") {
    return {
      verdict: "good",
      headline: "Gemma 4 E4B 기준으로 적합합니다",
      body: "현재 브라우저 신호상 Gemma 4 E4B를 목표 모델로 잡는 편이 맞습니다. 다만 실제 브라우저 다운로드 경로는 아직 더 작은 fallback runtime을 사용합니다.",
      chips,
    };
  }

  if (recommendation.tier === "e2b") {
    return {
      verdict: "mixed",
      headline: "Gemma 4 E2B 쪽이 더 안전합니다",
      body: "WebGPU는 되지만 하드웨어 여유가 넉넉하다고 보기 어려워서, Gemma 4에서는 E2B가 먼저입니다.",
      chips,
    };
  }

  if (signals.webGPU) {
    return {
      verdict: "mixed",
      headline: "Gemma 4보다는 fallback runtime이 먼저입니다",
      body: "브라우저에서는 현재 Gemma 3 270M fallback을 먼저 쓰고, Gemma 4는 더 무거운 로컬 런타임으로 준비하는 게 맞습니다.",
      chips,
    };
  }

  return {
    verdict: "blocked",
    headline: "이 브라우저에서는 Gemma 4가 무겁습니다",
    body: "WebGPU가 없어서 현재는 Gemma 3 270M fallback만 현실적입니다.",
    chips,
  };
}

type PendingSecretOperation = {
  role: LocalAgentFolderRole;
  path: string;
  operation: "read" | "write";
  nextText?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  timestamp?: string;
};

const RUNNABLE_LOCAL_MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX";
const RUNNABLE_LOCAL_MODEL_LABEL = "Gemma 3 270M browser fallback";
const PRIMARY_LOCAL_MODEL_LABEL = "Gemma 4 E4B";

type ModelTier = "recommended" | "fallback";

const MODEL_TIERS: Array<{
  id: ModelTier;
  label: string;
  model: string;
  description: string;
  badge?: string;
  icon: typeof Zap;
}> = [
  {
    id: "recommended",
    label: "Recommended",
    model: PRIMARY_LOCAL_MODEL_LABEL,
    description: "Gemma 4 target for stronger Macs",
    badge: "Gemma 4",
    icon: Atom,
  },
  {
    id: "fallback",
    label: "Fallback",
    model: "Gemma 3 270M",
    description: "Current browser download/runtime path",
    icon: Zap,
  },
];

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
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>("recommended");
  const [prompt, setPrompt] = useState("");
  const [adapterNotice, setAdapterNotice] = useState<string | null>(null);
  const [deviceSuitability, setDeviceSuitability] = useState<DeviceSuitability>(() =>
    buildDeviceSuitability(
      probeLocalAiCapabilities({
        fileSystemAccess: false,
        indexedDB: false,
        webGPU: false,
        browserName: "Unknown browser",
        osHint: "Unknown OS",
      }),
      DEFAULT_MODEL_RECOMMENDATION,
    ),
  );
  const [modelRun, setModelRun] = useState<LocalModelUiState>({
    status: "idle",
    message: `${RUNNABLE_LOCAL_MODEL_LABEL} is the current browser download path for Local Agent.`,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-greeting",
      role: "assistant",
      text: "안녕하세요. 여기서는 Gemma 4 기준 적합도를 먼저 보고, 필요하면 브라우저 fallback runtime을 다운로드한 뒤 대화할 수 있습니다.\n파일 작업 전에는 Code / Materials / Output 폴더를 직접 지정하세요.",
      timestamp: "11:52 AM",
    },
  ]);
  const adaptersRef = useRef<Partial<Record<LocalAgentFolderRole, BrowserFolderAdapter>>>({});
  const pendingSecretsRef = useRef<Record<string, PendingSecretOperation>>({});
  const modelEngineRef = useRef<ResolvedLocalModelEngine | null>(null);
  const modelSessionRef = useRef<unknown>(null);
  const windowFocus = useWindowFocus();
  const inDesktopShell = Boolean(inShell && windowFocus);

  useEffect(() => {
    if (state) {
      setWorkbench(externalWorkbench);
    }
  }, [externalWorkbench, state]);

  useEffect(() => {
    if (state) return;

    const { capabilities, recommendation, signals } = createCapabilityCards();
    setWorkbench((current) => ({
      ...current,
      capabilities,
      modelRecommendation: recommendation,
    }));
    setDeviceSuitability(buildDeviceSuitability(signals, recommendation));


    void openLocalAiDatabase()
      .then((database) => {
        database.close();
        setAdapterNotice(null);
      })
      .catch((error: unknown) => {
        setAdapterNotice(error instanceof Error ? error.message : "Browser storage is unavailable for Local Agent state.");
      });
  }, [state]);

  const selectedFolder = useMemo(
    () => workbench.folders.find((folder) => folder.role === selectedRole) ?? workbench.folders[0],
    [selectedRole, workbench.folders]
  );
  const hasGrantedFolder = workbench.folders.some((folder) => folder.permission === "granted");
  const allFoldersSelected = workbench.folders.every((folder) => folder.permission === "granted");


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

  const appendChatMessage = useCallback((role: ChatMessage["role"], text: string) => {
    setMessages((current) => [
      ...current,
      {
        id: makeUiId("message"),
        role,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ]);
  }, []);

  const readPath = useCallback(
    async (path: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        const message = `Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before reading files.`;
        setAdapterNotice(message);
        appendChatMessage("assistant", message);
        return;
      }

      const read = await adapter.readTextFile(path, approvalId);
      appendChatMessage("assistant", `Read ${read.path} locally. Preview: ${truncatePreview(read.text)}`);
      addEvent({
        title: `Read ${read.path}`,
        detail: `Loaded ${read.size} bytes locally. Preview: ${truncatePreview(read.text)}`,
        status: "complete",
        filePath: read.path,
      });
    },
    [addEvent, appendChatMessage, selectedRole]
  );

  const writePath = useCallback(
    async (path: string, nextText: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        const message = `Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before writing files.`;
        setAdapterNotice(message);
        appendChatMessage("assistant", message);
        return;
      }

      const write = await adapter.writeTextFile(path, nextText, approvalId);
      appendDiff(write.path, write.previousText, write.nextText);
      appendChatMessage("assistant", `Wrote ${write.path} locally and recorded a reviewable change summary.`);
      addEvent({
        title: `Wrote ${write.path}`,
        detail: "Applied the write through the selected-folder adapter and recorded a local diff summary.",
        status: "complete",
        filePath: write.path,
      });
    },
    [addEvent, appendChatMessage, appendDiff, selectedRole]
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
      appendChatMessage("assistant", `${operation.path} looks secret-like. Approve this single ${operation.operation} in the side rail before content is exposed or modified.`);
    },
    [addEvent, appendChatMessage]
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
        message: `${RUNNABLE_LOCAL_MODEL_LABEL} is loaded locally. This is the current browser fallback runtime for Local Agent.`,
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
      appendChatMessage("assistant", answer);
      addEvent({
        title: "Local model answered",
        detail: truncatePreview(answer),
        status: "complete",
      });
    },
    [addEvent, appendChatMessage, handleLoadModel, handleModelProgress]
  );

  const handleSubmitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setAdapterNotice("Write a local task first; empty prompts are not sent anywhere.");
      return;
    }

    appendChatMessage("user", trimmed);

    if (onSubmitPrompt) {
      await onSubmitPrompt(trimmed);
      return;
    }

    if (isCommandExecutionRequest(trimmed)) {
      const adapter = adaptersRef.current[selectedRole];
      const result = await runLocalAgentTurn(trimmed, adapter);
      appendChatMessage("assistant", result.message);
      addEvent({ title: "Command request rejected", detail: result.message, status: "blocked" });
      return;
    }

    const readTarget = parseReadPath(trimmed);
    const writeTarget = parseWriteRequest(trimmed);


    try {
      if (readTarget) {
        const adapter = adaptersRef.current[selectedRole];
        if (!adapter) {
          const message = `Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before reading files. The prompt stayed in this tab.`;
          setAdapterNotice(message);
          appendChatMessage("assistant", message);
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
          const message = `Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before writing files. The prompt stayed in this tab.`;
          setAdapterNotice(message);
          appendChatMessage("assistant", message);
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
      appendChatMessage("assistant", error instanceof Error ? error.message : "Unknown local adapter or model failure.");
    }
  }, [addEvent, answerWithLocalModel, appendChatMessage, blockSecret, onSubmitPrompt, prompt, readPath, selectedFolder, selectedRole, writePath]);

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
  const pendingApprovalEvents = workbench.events.filter((event) => event.approvalRequired).slice(0, 3);

  return (
    <div
      data-app="local-ai"
      data-mobile={isMobile ? "true" : "false"}
      data-shell={inShell ? "true" : "false"}
      className="h-full w-full overflow-hidden bg-[#fcfbf8] text-[#1d1c1a]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header
          className="flex shrink-0 items-center justify-between border-b border-[#e6e2dc] bg-[#fffefa]/95 px-7 py-5 backdrop-blur-xl"
          onMouseDown={inDesktopShell ? windowFocus?.onDragStart : undefined}
        >
          <div className="flex items-center gap-4">
            <WindowControls
              inShell={inDesktopShell}
              showWhenNotInShell={false}
              onClose={inDesktopShell ? windowFocus?.closeWindow : undefined}
              onMinimize={inDesktopShell ? windowFocus?.minimizeWindow : undefined}
              onToggleMaximize={inDesktopShell ? windowFocus?.toggleMaximize : undefined}
              isMaximized={windowFocus?.isMaximized ?? false}
              closeLabel="Close Local Agent"
              className="p-1"
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#0d0d0d] text-sm font-bold tracking-[-0.05em] text-white shadow-sm">
              CZ
            </div>
            <div className="text-[26px] font-semibold tracking-[-0.04em] text-[#151515]">cozac.dev</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <h1 className="mr-2 text-[26px] font-semibold tracking-[-0.04em] text-[#151515]">Local Agent</h1>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#eaf7eb] px-4 py-2 text-sm font-medium text-[#28743a]">
              <LockKeyhole className="h-4 w-4" />
              Local only
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e4e0da] bg-[#f5f2ee] px-4 py-2 text-sm font-medium text-[#6a6660]">
              <CheckCircle2 className="h-4 w-4" />
              {modelReady ? "Model ready" : modelBusy ? "Model loading" : "Model ready"}
            </span>
            {inDesktopShell && (
              <button
                type="button"
                onClick={windowFocus?.closeWindow}
                className="rounded-full border border-[#e4e0da] bg-white px-3 py-1.5 text-xs font-medium text-[#6a6660] transition hover:bg-[#f6f3ef]"
              >
                Close
              </button>
            )}
          </div>
        </header>

        <main className={cn("grid min-h-0 flex-1 bg-[#fcfbf8]", isMobile ? "grid-cols-1 overflow-auto" : "grid-cols-[360px_minmax(0,1fr)]") }>
          <aside className="flex min-h-0 flex-col overflow-auto border-r border-[#e6e2dc] bg-[#fbfaf7] px-7 py-7">
            <section>
              <div className="mb-3 text-lg font-medium tracking-[-0.02em] text-[#1d1c1a]">Model</div>
              <div className="grid gap-3">
                {MODEL_TIERS.map((tier) => {
                  const selected = selectedModelTier === tier.id;
                  const Icon = tier.icon;
                  const displayModel =
                    tier.id === "recommended"
                      ? workbench.modelRecommendation.label.replace(/\s+(recommended|likely suitable)$/i, "")
                      : tier.model;
                  const displayDescription =
                    tier.id === "recommended"
                      ? workbench.modelRecommendation.reason
                      : tier.description;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedModelTier(tier.id)}
                      className={cn(
                        "group flex min-h-[80px] items-center gap-4 rounded-[16px] border bg-white px-4 py-3 text-left transition hover:border-[#c5aa7a] hover:bg-[#fffdf7]",
                        selected ? "border-[#b9975d] shadow-[0_0_0_1px_rgba(185,151,93,0.18)]" : "border-[#e7e2dc]"
                      )}
                      aria-pressed={selected}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-[#ede8e2] bg-[#fffdfa] text-[#b57918]">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[-0.03em] text-[#1c1b19]">
                          {tier.label} — {displayModel}
                          {tier.badge && (
                            <span className="rounded-[7px] bg-[#f3ebdf] px-1.5 py-1 text-[11px] font-medium text-[#8a683c]">
                              {tier.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-sm text-[#5f5b55]">{displayDescription}</span>
                      </span>
                      {selected && (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1f1e1b] text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div
                className={cn(
                  "mt-4 rounded-[16px] border px-4 py-3",
                  deviceSuitability.verdict === "good"
                    ? "border-emerald-200 bg-emerald-50/80"
                    : deviceSuitability.verdict === "mixed"
                      ? "border-amber-200 bg-amber-50/80"
                      : "border-rose-200 bg-rose-50/80",
                )}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7d776f]">This device</div>
                <div className="mt-1 text-[15px] font-semibold text-[#1d1c1a]">{deviceSuitability.headline}</div>
                <p className="mt-1 text-sm leading-relaxed text-[#5f5b55]">{deviceSuitability.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {deviceSuitability.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[#e5ddd2] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#615b54]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLoadModel().catch(() => undefined)}
                disabled={modelBusy}
                className="mt-4 flex min-h-[58px] w-full items-center justify-center gap-3 rounded-[16px] bg-[#24221f] px-4 py-3 text-[16px] font-semibold text-white transition hover:scale-[1.01] hover:bg-[#171613] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-5 w-5" />
                {modelReady ? "Reload browser fallback" : modelBusy ? "Downloading browser fallback..." : "Download browser fallback"}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-[#706a62]">
                Current browser runtime: {RUNNABLE_LOCAL_MODEL_LABEL}. Gemma 4 is shown here as the target tier and suitability decision for this device.
              </p>
              {(modelRun.status === "loading" || modelRun.status === "generating" || modelRun.status === "error") && (
                <div className="mt-3 rounded-[14px] bg-[#f5f1ea] p-3 text-xs leading-relaxed text-[#69635c]">
                  <div className="flex items-center justify-between gap-3 font-medium uppercase tracking-[0.12em]">
                    <span>{modelRun.status}</span>
                    {typeof modelRun.progress === "number" && <span>{modelRun.progress}%</span>}
                  </div>
                {typeof modelRun.progress === "number" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div className="h-full rounded-full bg-[#b88432]" style={{ width: `${Math.min(Math.max(modelRun.progress, 0), 100)}%` }} />
                  </div>
                )}
                  <p className="mt-2">{modelRun.error ?? modelRun.message}</p>
                </div>
              )}
            </section>

            <section className="mt-7 border-t border-[#e3ded7] pt-5">
              <div className="mb-3 text-lg font-medium tracking-[-0.02em] text-[#1d1c1a]">Workspace</div>
              <div className="mb-3 rounded-[16px] border border-[#e7e2dc] bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7d776f]">Local folders</div>
                <p className="mt-1 text-sm leading-relaxed text-[#5f5b55]">
                  파일 작업은 여기서 직접 지정한 로컬 폴더만 사용합니다. Code / Materials / Output 폴더를 각각 눈에 보이게 선택할 수 있어야 합니다.
                </p>
                <div className="mt-3 grid gap-2">
                  {workbench.folders.map((folder) => (
                    <button
                      key={`${folder.id}-selector`}
                      type="button"
                      onClick={() => void handleSelectFolder(folder.role)}
                      className="flex items-center justify-between rounded-[12px] border border-[#e7e2dc] bg-[#fcfbf8] px-3 py-2.5 text-left text-sm font-medium text-[#2a2722] transition hover:bg-white"
                    >
                      <span>{folder.permission === "granted" ? `Change ${ROLE_COPY[folder.role].label} folder` : `Select ${ROLE_COPY[folder.role].label} folder`}</span>
                      <span className="text-xs uppercase tracking-[0.12em] text-[#8c877f]">
                        {folder.permission === "granted" ? "selected" : "required"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#706a62]">
                  {allFoldersSelected
                    ? "All local folders are assigned."
                    : hasGrantedFolder
                      ? "At least one local folder is assigned. Add the rest for a complete local workspace."
                      : "No local folder is assigned yet."}
                </p>
              </div>
              <div className="grid gap-2">
                {workbench.folders.map((folder) => {
                  const selected = selectedRole === folder.role;
                  const Icon = folder.role === "code" ? Code2 : Folder;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => void handleSelectFolder(folder.role)}
                      className={cn(
                        "flex min-h-[70px] items-center gap-4 rounded-[15px] border px-4 py-3 text-left transition",
                        selected
                          ? "border-[#d8d1c8] bg-white text-[#181715] shadow-sm"
                          : "border-[#e7e2dc] bg-white/70 hover:bg-white"
                      )}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-[#e8e3dc] bg-[#fffefa] text-[#1d1c1a]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold tracking-[-0.02em]">{ROLE_COPY[folder.role].label}</span>
                        <span className="mt-0.5 block truncate text-sm text-[#5f5b55]">{folder.name}</span>
                        <span className="mt-1 block text-xs text-[#8a837b]">{ROLE_COPY[folder.role].description}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[#8c877f]">
                          {folder.permission === "granted" ? "Selected" : "Select folder"}
                        </span>
                        <ChevronRight className="h-5 w-5 text-[#4f4a44]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {(pendingApprovalEvents.length > 0 || adapterNotice) && (
              <section className="mt-5 border-t border-[#e3ded7] pt-4">
                {pendingApprovalEvents.length > 0 && (
                  <div className="grid gap-2">
                    {pendingApprovalEvents.map((event) => (
                      <div key={event.id} className="rounded-2xl bg-[#f5f1ea] p-3 text-xs leading-relaxed text-[#5f5b55]">
                        <div className="font-semibold">Approval needed</div>
                        <p className="mt-1 opacity-70">{event.filePath ?? event.title}</p>
                        <button type="button" onClick={() => void handleReviewSecret(event.id)} className="mt-2 rounded-full border border-[#d8d1c8] px-3 py-1 font-semibold">Approve once</button>
                      </div>
                    ))}
                  </div>
                )}
                {adapterNotice && (
                  <p className="mt-3 text-xs leading-relaxed text-[#6e6861] first:mt-0">{adapterNotice}</p>
                )}
              </section>
            )}

            <div className="mt-auto flex items-center justify-between border-t border-[#e3ded7] pt-5 text-[#5f5b55]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111] text-sm font-semibold text-white">N</span>
                <span className="text-sm">cozac.dev</span>
                <ChevronRight className="h-4 w-4 rotate-90" />
              </div>
              <Settings className="h-5 w-5" />
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden bg-[#fffefa]">
            <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
              <div className="space-y-3 px-9 py-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start gap-4",
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <span className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#111] text-sm font-bold text-white">CZ</span>
                    )}
                    <div
                      className={cn(
                        "max-w-[760px] rounded-[24px] px-6 py-3 text-[15px] leading-[1.42] shadow-none",
                        message.role === "user"
                          ? "order-1 rounded-br-[10px] bg-[#262420] text-white"
                          : "rounded-tl-[10px] bg-[#f5f1ec] text-[#38342f]"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      {message.timestamp && (
                        <div
                          className={cn(
                            "mt-3 text-sm",
                            message.role === "user" ? "text-right text-white/60" : "text-[#8a837b]"
                          )}
                        >
                          {message.timestamp}
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <span className="order-2 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#262420] text-sm font-semibold text-white">N</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className={cn("bg-[#fffefa] px-8 pb-4 pt-2", inShell ? "pb-24" : "")}>
              <div className="flex items-end gap-3 rounded-[22px] border border-[#dfdbd4] bg-white px-5 py-2.5 shadow-[0_8px_28px_rgba(42,37,29,0.08)]">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[36px] flex-1 resize-none border-0 bg-transparent p-0 text-[17px] text-[#2a2926] shadow-none placeholder:text-[#9b9690] focus-visible:ring-0"
                  placeholder="메시지를 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => void handleSubmitPrompt()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#262420] text-white transition hover:scale-[1.04] hover:bg-[#171613]"
                  aria-label="Send local prompt"
                >
                  <Send className="h-6 w-6" />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#7a746d]">
                대화는 바로 가능하지만, 코드/문서/출력 파일 작업은 위에서 로컬 폴더를 먼저 지정해야 합니다.
              </p>
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
