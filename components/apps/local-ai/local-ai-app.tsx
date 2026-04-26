"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWindowFocus } from "@/lib/window-focus-context";
import { WindowControls } from "@/components/window-controls";
import {
  BrowserFolderAdapter,
  type BrowserLocalRuntimeFamily,
  GEMMA4_E2B_MODEL_ID,
  GEMMA4_E2B_MODEL_LABEL,
  GEMMA4_E4B_MODEL_ID,
  GEMMA4_E4B_MODEL_LABEL,
  WEBLLM_BROWSER_MODELS,
  WEBLLM_DEFAULT_MODEL_LABEL,
  RUNNABLE_LOCAL_MODEL_ID,
  RUNNABLE_LOCAL_MODEL_LABEL,
  clearLocalAiBrowserStorage,
  chooseBrowserLocalRuntime,
  createLineDiffSummary,
  getChatInputKeyIntent,
  getWebLlmBrowserModel,
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
      : recommendation.tier === "smollm2-135m-instruct"
        ? recommendation.status === "ready" ? 48 : 34
        : 8;

  return {
    tier: recommendation.tier === "gemma-4-e4b" ? "e4b" : recommendation.tier === "gemma-4-e2b" ? "e2b" : recommendation.tier === "smollm2-135m-instruct" ? "fallback" : "unsupported",
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
          : "Folder picking is unavailable here; local chat/model download can still run from browser storage.",
      },
      {
        id: "webgpu",
        label: "WebGPU",
        status: capabilityStatus(signals.webGPU, true),
        detail: signals.webGPU
          ? "WebGPU is available for browser-local model runtimes."
          : "WebGPU is unavailable; WebLLM requires WebGPU for the fast browser chat path, so show a clear unsupported state instead of falling into cloud fallback.",
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

  if (!signals.indexedDB) {
    return {
      verdict: "blocked",
      headline: "브라우저 로컬 저장소가 먼저 필요합니다",
      body: "이 브라우저에서는 IndexedDB 저장소가 막혀 있어서 모델/세션을 휴대폰 안에 받을 수 없습니다.",
      chips,
    };
  }

  if (!signals.fileSystemAccess) {
    return {
      verdict: "mixed",
      headline: signals.webGPU ? "폴더 없이 휴대폰 로컬 채팅 가능" : "폴더 없이 가능하지만 속도는 느립니다",
      body: signals.webGPU
        ? "이 브라우저는 폴더 선택 API가 없어 파일 작업은 꺼두지만, 모델은 브라우저 저장소에 받아서 이 기기 안에서 대화할 수 있습니다."
        : "폴더 선택은 안 되지만 브라우저 저장소는 살아 있습니다. WebGPU가 없어 가벼운 fallback 런타임만 현실적입니다.",
      chips,
    };
  }

  if (recommendation.tier === "e4b") {
    return {
      verdict: "good",
      headline: "이 PC는 E4B 후보지만, 즉시 대화는 WebLLM Qwen부터입니다",
      body: "E4B/E2B는 품질 모델 후보입니다. 하지만 브라우저에서 '안녕' 같은 첫 응답을 바로 확인할 기본 런타임은 WebLLM Qwen2.5 0.5B q4f32입니다. 무거운 Gemma 설치는 별도 고급 경로로 둡니다.",
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
      body: "브라우저에서는 현재 가벼운 호환 런타임이 먼저이고, Gemma 4는 더 무거운 로컬 런타임으로 준비하는 편이 맞습니다.",
      chips,
    };
  }

  return {
    verdict: "blocked",
    headline: "이 브라우저에서는 Gemma 4가 무겁습니다",
    body: "WebGPU가 없어서 현재는 가벼운 호환 런타임만 현실적입니다.",
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

type SelectedBrowserModel = {
  family: Exclude<BrowserLocalRuntimeFamily, "none">;
  id: string;
  label: string;
  shortLabel: string;
  sizeLabel: string;
  speedLabel: "Fast" | "Balanced" | "Strong" | "Heavy";
  description: string;
  badge?: string;
  guardCopy?: string;
};

const MOBILE_FALLBACK_BROWSER_MODEL: SelectedBrowserModel = {
  family: "transformers",
  id: RUNNABLE_LOCAL_MODEL_ID,
  label: RUNNABLE_LOCAL_MODEL_LABEL,
  shortLabel: "SmolLM2 135M",
  sizeLabel: "135M",
  speedLabel: "Fast",
  description: "Mobile fallback model for CPU/WASM local chat on phones, missing WebGPU, or failed adapter checks.",
  badge: "Mobile fallback",
};

const ADVANCED_BROWSER_LOCAL_MODELS: SelectedBrowserModel[] = [
  {
    family: "transformers",
    id: GEMMA4_E2B_MODEL_ID,
    label: GEMMA4_E2B_MODEL_LABEL,
    shortLabel: "Gemma 4 E2B",
    sizeLabel: "~5.7GB",
    speedLabel: "Heavy",
    badge: "Verified heavy local model",
    description: "Gemma 4 E2B ONNX path with actual local load + generation proof; use on strong desktop Chrome/Edge only.",
    guardCopy: "Gemma heavy models are disabled on phone-like fallback devices. Use SmolLM2 135M CPU/WASM fallback on mobile.",
  },
  {
    family: "transformers",
    id: GEMMA4_E4B_MODEL_ID,
    label: GEMMA4_E4B_MODEL_LABEL,
    shortLabel: "Gemma 4 E4B",
    sizeLabel: "E4B",
    speedLabel: "Heavy",
    badge: "Experimental / unverified",
    description: "Higher-quality Gemma 4 candidate for very strong desktop browsers; exact E4B load/generation proof is not completed yet.",
    guardCopy: "Gemma heavy models are disabled on phone-like fallback devices. Use SmolLM2 135M CPU/WASM fallback on mobile.",
  },
];

function getTransformersBrowserModel(modelIdOverride?: string): SelectedBrowserModel {
  return [MOBILE_FALLBACK_BROWSER_MODEL, ...ADVANCED_BROWSER_LOCAL_MODELS].find((model) => model.id === modelIdOverride) ?? MOBILE_FALLBACK_BROWSER_MODEL;
}

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

async function resolveLocalModelEngine(family: BrowserLocalRuntimeFamily = "webllm"): Promise<ResolvedLocalModelEngine> {
  const engineModule = (family === "transformers"
    ? await import("@/lib/local-ai/model-engine")
    : await import("@/lib/local-ai/webllm-engine")) as unknown as LocalModelEngineModule;
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
  const [selectedWebLlmModelId, setSelectedWebLlmModelId] = useState(WEBLLM_BROWSER_MODELS[0]?.id ?? "Qwen2.5-0.5B-Instruct-q4f32_1-MLC");
  const [selectedTransformersModelId, setSelectedTransformersModelId] = useState<string | null>(null);
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
  const [runtimeProfile, setRuntimeProfile] = useState(() =>
    chooseBrowserLocalRuntime(
      probeLocalAiCapabilities({
        fileSystemAccess: false,
        indexedDB: false,
        webGPU: false,
        browserName: "Unknown browser",
        osHint: "Unknown OS",
      }),
    ),
  );
  const [modelRun, setModelRun] = useState<LocalModelUiState>({
    status: "idle",
    message: `${WEBLLM_DEFAULT_MODEL_LABEL} is the current browser download path for Local Agent.`,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-greeting",
      role: "assistant",
      text: "WebLLM처럼 바로 쓰는 흐름에 Gemma 고급 선택지를 붙였습니다. 왼쪽에서 Qwen2.5, SmolLM2, Llama 같은 WebLLM 모델을 고르거나 Advanced local models에서 Gemma 4 E2B/E4B를 직접 선택한 뒤 Download selected model을 누르면 됩니다.\nGemma 4 E2B는 실제 로드/생성 proof가 끝난 heavy 모델이고, Gemma 4 E4B는 아직 Experimental / unverified 후보입니다. 모바일/phone-like fallback에서는 무거운 Gemma 대신 SmolLM2 135M CPU/WASM을 씁니다.",
      timestamp: "11:52 AM",
    },
  ]);
  const adaptersRef = useRef<Partial<Record<LocalAgentFolderRole, BrowserFolderAdapter>>>({});
  const pendingSecretsRef = useRef<Record<string, PendingSecretOperation>>({});
  const modelEngineRef = useRef<ResolvedLocalModelEngine | null>(null);
  const modelEngineFamilyRef = useRef<BrowserLocalRuntimeFamily | null>(null);
  const modelSessionRef = useRef<unknown>(null);
  const loadedModelIdRef = useRef<string | null>(null);
  const loadedModelFamilyRef = useRef<BrowserLocalRuntimeFamily | null>(null);
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
    setRuntimeProfile(chooseBrowserLocalRuntime(signals));


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

  const selectedWebLlmModel = useMemo(() => getWebLlmBrowserModel(selectedWebLlmModelId), [selectedWebLlmModelId]);
  const selectedTransformersModel = useMemo(() => getTransformersBrowserModel(selectedTransformersModelId ?? undefined), [selectedTransformersModelId]);
  const heavyModelSelectionDisabled = runtimeProfile.isPhoneLike || runtimeProfile.recommendedFamily !== "webllm" || runtimeProfile.status === "blocked";
  const selectedModel = useMemo<SelectedBrowserModel>(() => {
    if (selectedTransformersModelId) {
      return selectedTransformersModel;
    }

    return runtimeProfile.recommendedFamily === "transformers"
      ? MOBILE_FALLBACK_BROWSER_MODEL
      : selectedWebLlmModel;
  }, [runtimeProfile.recommendedFamily, selectedTransformersModel, selectedTransformersModelId, selectedWebLlmModel]);

  useEffect(() => {
    if (!heavyModelSelectionDisabled || !selectedTransformersModelId) return;

    setSelectedTransformersModelId(null);
    if (ADVANCED_BROWSER_LOCAL_MODELS.some((model) => loadedModelIdRef.current === model.id)) {
      modelSessionRef.current = null;
    }
    setModelRun({
      status: "idle",
      message: "Gemma heavy models are disabled on phone-like fallback devices. Use SmolLM2 135M CPU/WASM fallback on mobile.",
    });
  }, [heavyModelSelectionDisabled, selectedTransformersModelId]);

  const handleCheckThisDevice = useCallback(async () => {
    const { capabilities, recommendation, signals } = createCapabilityCards();
    setWorkbench((current) => ({
      ...current,
      capabilities,
      modelRecommendation: recommendation,
    }));
    setDeviceSuitability(buildDeviceSuitability(signals, recommendation));
    let webGpuAdapterAvailable: boolean | null = null;
    if (signals.webGPU && typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        webGpuAdapterAvailable = Boolean(await gpu?.requestAdapter());
      } catch {
        webGpuAdapterAvailable = false;
      }
    } else {
      webGpuAdapterAvailable = false;
    }

    const nextProfile = chooseBrowserLocalRuntime(signals, { webGpuAdapterAvailable });
    setRuntimeProfile(nextProfile);
    addEvent({
      title: "Device runtime checked",
      detail: `${nextProfile.recommendedLabel}: ${nextProfile.reason}`,
      status: nextProfile.status === "blocked" ? "blocked" : "complete",
    });
    if (nextProfile.recommendedFamily === "transformers") {
      setSelectedTransformersModelId(null);
      setModelRun({
        status: "idle",
        message: "Mobile fallback selected: SmolLM2 135M on CPU/WASM. Download selected model to chat locally.",
      });
    }
  }, [addEvent]);

  const handleLoadModel = useCallback(async (modelIdOverride?: string, familyOverride?: BrowserLocalRuntimeFamily) => {
    const selectedModel: SelectedBrowserModel = familyOverride === "transformers"
      ? getTransformersBrowserModel(modelIdOverride)
      : getWebLlmBrowserModel(modelIdOverride ?? selectedWebLlmModelId);

    setModelRun({
      status: "loading",
      message: `Downloading/loading ${selectedModel.shortLabel}; model files stay in this browser cache.`,
      progress: 0,
    });

    try {
      const engine = modelEngineFamilyRef.current === selectedModel.family && modelEngineRef.current
        ? modelEngineRef.current
        : await resolveLocalModelEngine(selectedModel.family);
      modelEngineRef.current = engine;
      modelEngineFamilyRef.current = selectedModel.family;
      const session = await engine.load({
        modelId: selectedModel.id,
        onProgress: (progress: unknown) => handleModelProgress(progress, "loading"),
      });
      modelSessionRef.current = session;
      loadedModelIdRef.current = selectedModel.id;
      loadedModelFamilyRef.current = selectedModel.family;
      setModelRun((current) => ({
        ...current,
        status: "ready",
        message: `${selectedModel.shortLabel} is ready. Type 안녕 and the answer stays inside this browser tab.`,
        progress: 100,
        error: undefined,
      }));
      addEvent({
        title: "Local model loaded",
        detail: `${selectedModel.id} loaded through ${selectedModel.family}. No chat route, localhost bridge, or cloud fallback was used by the UI.`,
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
  }, [addEvent, handleModelProgress, selectedWebLlmModelId]);

  const answerWithLocalModel = useCallback(
    async (userPrompt: string, localContext?: string) => {
      const engine = modelEngineFamilyRef.current === selectedModel.family && modelEngineRef.current
        ? modelEngineRef.current
        : await resolveLocalModelEngine(selectedModel.family);
      modelEngineRef.current = engine;
      modelEngineFamilyRef.current = selectedModel.family;
      const needsReload = loadedModelIdRef.current !== selectedModel.id || loadedModelFamilyRef.current !== selectedModel.family;
      if (needsReload) {
        modelSessionRef.current = null;
      }
      const session = modelSessionRef.current ?? (await handleLoadModel(selectedModel.id, selectedModel.family));

      setModelRun((current) => ({
        ...current,
        status: "generating",
        message: `Generating with ${selectedModel.shortLabel}...`,
        error: undefined,
      }));

      const output = await engine.generate({
        prompt: userPrompt,
        modelId: selectedModel.id,
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
    [addEvent, appendChatMessage, handleLoadModel, handleModelProgress, selectedModel]
  );

  const handleSubmitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setAdapterNotice("Write a local task first; empty prompts are not sent anywhere.");
      return;
    }

    appendChatMessage("user", trimmed);
    setPrompt("");

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

  const handleClearLocalModelStorage = useCallback(async () => {
    modelSessionRef.current = null;
    loadedModelIdRef.current = null;
    loadedModelFamilyRef.current = null;
    modelEngineFamilyRef.current = null;
    setModelRun({
      status: "idle",
      message: "Local model storage was reset. Choose a model and click Download selected model again to chat.",
      progress: undefined,
      answer: undefined,
      error: undefined,
    });

    const result = await clearLocalAiBrowserStorage();
    const detail = result.errors.length
      ? `Reset attempted, but some storage could not be cleared: ${result.errors.join("; ")}`
      : `Deleted Local Agent IndexedDB${result.deletedDatabase ? "" : " (not present or blocked)"} and ${result.deletedCaches.length} model/cache bucket(s).`;
    addEvent({ title: "Local model storage cleared", detail, status: result.errors.length ? "blocked" : "complete" });
    appendChatMessage("assistant", result.errors.length ? detail : "로컬 모델/세션 저장소를 지웠습니다. 다시 쓰려면 모델을 고르고 Download selected model을 누르세요.");
  }, [addEvent, appendChatMessage]);

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
  const modelReady = modelRun.status === "ready" && loadedModelIdRef.current === selectedModel.id && loadedModelFamilyRef.current === selectedModel.family;
  const pendingApprovalEvents = workbench.events.filter((event) => event.approvalRequired).slice(0, 3);
  const handleInstallSelectedModel = useCallback(async () => {
    await handleLoadModel(selectedModel.id, selectedModel.family);
  }, [handleLoadModel, selectedModel]);

  return (
    <div
      data-app="local-ai"
      data-mobile={isMobile ? "true" : "false"}
      data-shell={inShell ? "true" : "false"}
      className="h-full w-full overflow-hidden bg-[#f7f5f0] text-[#171615]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header
          className="flex shrink-0 items-center justify-between border-b border-[#e3ded6] bg-white px-4 py-3 sm:px-6"
          onMouseDown={inDesktopShell ? windowFocus?.onDragStart : undefined}
        >
          <div className="flex min-w-0 items-center gap-3">
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#111] text-xs font-bold text-white">CZ</div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-[#171615]">Local LLM</h1>
              <p className="truncate text-xs text-[#777068]">Download a browser model. Chat in this tab.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-[#eaf7eb] px-3 py-1.5 text-xs font-semibold text-[#267238] sm:inline-flex">Local only</span>
            <span className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              modelReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : modelBusy ? "border-amber-200 bg-amber-50 text-amber-700" : "border-[#e2ddd5] bg-[#f7f5f0] text-[#67615a]",
            )}>
              {modelReady ? "Ready" : modelBusy ? "Loading" : "Not installed"}
            </span>
          </div>
        </header>

        <main className={cn("grid min-h-0 flex-1", isMobile ? "grid-cols-1 overflow-auto" : "grid-cols-[320px_minmax(0,1fr)] overflow-hidden")}>
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r border-[#e3ded6] bg-[#fbfaf7] p-4">
            <section className="rounded-3xl border border-[#ddd5ca] bg-white p-4 shadow-[0_14px_40px_rgba(35,31,25,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9a7240]">Select browser model</div>
                  <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#171615]">{selectedModel.shortLabel}</div>
                  <p className="mt-1 text-sm leading-relaxed text-[#67615a]">WebLLM fast path 또는 Advanced Gemma ONNX 모델을 고르고 브라우저 캐시에 다운로드한 뒤 이 탭에서 바로 채팅합니다.</p>
                </div>
                <span className="rounded-full bg-[#f2eadf] px-2.5 py-1 text-[11px] font-semibold text-[#8a6332]">{selectedModel.speedLabel}</span>
              </div>

              <div className="mt-4 rounded-2xl border border-[#eadcc8] bg-[#fffaf1] p-3 text-xs leading-relaxed text-[#5f574f]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold uppercase tracking-[0.14em] text-[#9a7240]">Current device</div>
                    <p className="mt-1 font-semibold text-[#211f1b]">{runtimeProfile.recommendedLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCheckThisDevice().catch(() => undefined)}
                    className="shrink-0 rounded-xl border border-[#d8c7ad] bg-white px-3 py-1.5 text-[11px] font-bold text-[#5e4a2d] transition hover:bg-[#fff7e6]"
                  >
                    Check this device
                  </button>
                </div>
                <p className="mt-2">{runtimeProfile.reason}</p>
                <p className="mt-2 font-semibold text-[#7a5830]">Mobile fallback uses SmolLM2 135M on CPU/WASM when phones or failed WebGPU adapters need the safe path.</p>
              </div>

              <div className="mt-4 grid gap-2">
                {WEBLLM_BROWSER_MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedTransformersModelId(null);
                      setSelectedWebLlmModelId(model.id);
                      if (loadedModelIdRef.current !== model.id || loadedModelFamilyRef.current !== "webllm") {
                        modelSessionRef.current = null;
                        setModelRun({
                          status: "idle",
                          message: `${model.shortLabel} selected. Download selected model to chat locally.`,
                        });
                      }
                    }}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-2.5 text-left transition hover:bg-[#fffdf8]",
                      selectedModel.family === "webllm" && selectedWebLlmModel.id === model.id ? "border-[#171615] bg-[#fff8ea]" : "border-[#e6e0d8] bg-white",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-[#211f1b]">{model.shortLabel}</span>
                      <span className="rounded-full bg-[#f3eee7] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#81786e]">{model.sizeLabel}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#777068]">{model.description}</p>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#81786e]">Quick picks include Qwen2.5 0.5B, SmolLM2 360M, Llama 3.2 1B, Qwen2.5 1.5B.</p>

              <div className="mt-4 rounded-2xl border border-[#e5ded2] bg-[#fffdf8] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9a7240]">Advanced local models</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#67615a]">Gemma 4 E2B/E4B run through the Transformers/ONNX path. They are explicit heavy choices, not the mobile default.</p>
                  </div>
                  {heavyModelSelectionDisabled && (
                    <span className="shrink-0 rounded-full bg-[#fff0e4] px-2 py-1 text-[10px] font-bold uppercase text-[#9a4f25]">guarded</span>
                  )}
                </div>
                {heavyModelSelectionDisabled && (
                  <p className="mt-2 rounded-xl bg-[#fff5ed] px-3 py-2 text-xs font-semibold leading-relaxed text-[#8a4d24]">
                    Gemma heavy models are disabled on phone-like fallback devices. Use SmolLM2 135M CPU/WASM fallback on mobile.
                  </p>
                )}
                <div className="mt-3 grid gap-2">
                  {ADVANCED_BROWSER_LOCAL_MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      disabled={modelBusy || heavyModelSelectionDisabled}
                      onClick={() => {
                        if (heavyModelSelectionDisabled) return;
                        setSelectedTransformersModelId(model.id);
                        if (loadedModelIdRef.current !== model.id || loadedModelFamilyRef.current !== model.family) {
                          modelSessionRef.current = null;
                          setModelRun({
                            status: "idle",
                            message: `${model.shortLabel} selected. Download selected model to chat locally. ${model.badge ?? ""}`.trim(),
                          });
                        }
                      }}
                      className={cn(
                        "w-full rounded-2xl border px-3 py-2.5 text-left transition",
                        selectedModel.family === model.family && selectedModel.id === model.id ? "border-[#171615] bg-[#fff8ea]" : "border-[#e6e0d8] bg-white",
                        heavyModelSelectionDisabled ? "cursor-not-allowed opacity-60" : "hover:bg-[#fffdf8]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-[#211f1b]">{model.shortLabel}</span>
                        <span className="rounded-full bg-[#f3eee7] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#81786e]">{model.sizeLabel}</span>
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-[#9a7240]">{model.badge}</div>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[#777068]">{heavyModelSelectionDisabled ? model.guardCopy : model.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleInstallSelectedModel().catch(() => undefined)}
                disabled={modelBusy}
                className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#171615] px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {modelReady ? `${selectedModel.shortLabel} ready` : modelBusy ? "Downloading / loading..." : "Download selected model"}
              </button>
              <button
                type="button"
                onClick={() => void handleClearLocalModelStorage().catch(() => undefined)}
                disabled={modelBusy}
                className="mt-2 flex min-h-[42px] w-full items-center justify-center rounded-2xl border border-[#ddd5ca] bg-white px-4 py-2 text-sm font-semibold text-[#5e5851] transition hover:bg-[#faf7f2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear downloaded model
              </button>

              {(modelRun.status === "loading" || modelRun.status === "generating" || modelRun.status === "error" || modelReady) && (
                <div className="mt-4 rounded-2xl border border-[#e5ded2] bg-[#fffdf8] p-3 text-xs leading-relaxed text-[#67615a]">
                  <div className="flex items-center justify-between gap-3 font-bold uppercase tracking-[0.14em] text-[#81786e]">
                    <span>{modelReady ? "ready" : modelRun.status}</span>
                    {typeof modelRun.progress === "number" && <span>{modelRun.progress}%</span>}
                  </div>
                  {typeof modelRun.progress === "number" && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full rounded-full bg-[#b88432]" style={{ width: `${Math.min(Math.max(modelRun.progress, 0), 100)}%` }} />
                    </div>
                  )}
                  <p className="mt-2">{modelRun.error ?? modelRun.message}</p>
                </div>
              )}
            </section>

            <details className="rounded-3xl border border-[#e3ded6] bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[#211f1b] marker:hidden">
                Advanced notes
                <span className="ml-2 text-xs font-normal text-[#81786e]">Gemma stays separate</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[#67615a]">
                Gemma 4 E2B/E4B는 이 PC에서 따로 검증할 품질 후보입니다. 이 화면의 기본 흐름은 WebLLM 모델 선택 → Download selected model → Ready → chat입니다.
              </p>
            </details>

            <details className="rounded-3xl border border-[#e3ded6] bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[#211f1b] marker:hidden">
                Optional file tools
                <span className="ml-2 text-xs font-normal text-[#81786e]">not needed for chat</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[#67615a]">일반 채팅은 폴더 없이 됩니다. 파일 읽기/쓰기만 폴더를 직접 고릅니다.</p>
              <div className="mt-3 grid gap-2">
                {workbench.folders.map((folder) => (
                  <button
                    key={`${folder.id}-selector`}
                    type="button"
                    onClick={() => void handleSelectFolder(folder.role)}
                    className="rounded-2xl border border-[#e6e0d8] bg-[#fbfaf7] px-3 py-2 text-left text-xs font-semibold text-[#5e5851] transition hover:bg-white"
                  >
                    {folder.permission === "granted" ? `Change ${ROLE_COPY[folder.role].label}` : `Select ${ROLE_COPY[folder.role].label}`}
                  </button>
                ))}
              </div>
              {adapterNotice && <p className="mt-3 text-xs leading-relaxed text-[#8a4d36]">{adapterNotice}</p>}
              {pendingApprovalEvents.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {pendingApprovalEvents.map((event) => (
                    <button key={event.id} type="button" onClick={() => void handleReviewSecret(event.id)} className="rounded-2xl border border-[#e7cfc5] bg-[#fff7f3] px-3 py-2 text-left text-xs font-semibold text-[#8a4d36]">
                      Approve once · {event.filePath ?? event.title}
                    </button>
                  ))}
                </div>
              )}
            </details>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden bg-[#fffefa]">
            {!modelReady && (
              <div className="border-b border-[#eee7df] bg-[#fff8ea] px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-3 rounded-3xl border border-[#e2cfae] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9a7240]">One click setup</div>
                    <div className="mt-1 text-base font-semibold text-[#171615]">Download selected model, then chat.</div>
                    <p className="mt-1 text-sm leading-relaxed text-[#67615a]">선택 모델: {selectedModel.shortLabel}. 다운로드가 끝나면 상태가 Ready로 바뀝니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleInstallSelectedModel().catch(() => undefined)}
                    disabled={modelBusy}
                    className="flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#171615] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {modelBusy ? "Downloading..." : "Download selected model"}
                  </button>
                </div>
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-5 sm:px-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex items-end gap-3", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "assistant" && (
                      <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#171615] text-xs font-bold text-white">AI</span>
                    )}
                    <div
                      className={cn(
                        "max-w-[min(720px,85%)] rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
                        message.role === "user"
                          ? "rounded-br-lg bg-[#171615] text-white"
                          : "rounded-bl-lg bg-[#f1eee8] text-[#2d2924]",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      {message.timestamp && (
                        <div className={cn("mt-2 text-[11px]", message.role === "user" ? "text-white/55" : "text-[#8a837b]")}>{message.timestamp}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className={cn("border-t border-[#eee7df] bg-white px-4 py-4 sm:px-6", inShell ? "pb-24" : "")}>
              <div className="mx-auto flex w-full max-w-4xl items-end gap-3 rounded-3xl border border-[#ded7ce] bg-[#fbfaf7] p-3 shadow-[0_10px_30px_rgba(35,31,25,0.07)]">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    const intent = getChatInputKeyIntent({
                      key: event.key,
                      shiftKey: event.shiftKey,
                      altKey: event.altKey,
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                      keyCode: event.nativeEvent.keyCode,
                      isComposing: event.nativeEvent.isComposing,
                    });

                    if (intent !== "submit") return;

                    event.preventDefault();
                    void handleSubmitPrompt();
                  }}
                  rows={1}
                  className="max-h-[160px] min-h-[48px] flex-1 resize-none border-0 bg-transparent p-0 text-[16px] leading-6 text-[#201d19] shadow-none outline-none placeholder:text-[#9b9690] focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder={modelReady ? "Ask anything local..." : "Install model first, then type 안녕"}
                />
                <button
                  type="button"
                  onClick={() => void handleSubmitPrompt()}
                  disabled={modelBusy}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#171615] text-white transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send local prompt"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
              <p className="mx-auto mt-2 max-w-4xl text-xs text-[#81786e]">Enter 전송 · Shift+Enter 줄바꿈 · cloud fallback 없음</p>
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
