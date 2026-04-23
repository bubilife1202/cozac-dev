import type { CapabilitySignals, ModelRecommendation } from "./types";
import { probeLocalAiCapabilities, recommendLocalModel } from "./diagnostics";

export const RUNNABLE_LOCAL_MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX" as const;
export const RUNNABLE_LOCAL_MODEL_LABEL = "Gemma 3 270M IT (ONNX)" as const;
export const RUNNABLE_LOCAL_MODEL_DTYPE = "q4" as const;
export const LOCAL_AI_RUNNABLE_MODEL_ID = RUNNABLE_LOCAL_MODEL_ID;
export const LOCAL_AI_RUNNABLE_MODEL_LABEL = RUNNABLE_LOCAL_MODEL_LABEL;
export const LOCAL_AI_RUNNABLE_MODEL_DTYPE = RUNNABLE_LOCAL_MODEL_DTYPE;
export const LOCAL_AI_DEFAULT_MAX_NEW_TOKENS = 96;

export type LocalModelDevice = "cpu" | "webgpu";
export type LocalModelStatus = "idle" | "loading" | "ready" | "generating" | "error";
export type LocalModelProgressStatus = "idle" | "loading" | "ready" | "generating" | "error";

export type LocalChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LocalModelProgress = {
  status: LocalModelProgressStatus;
  message: string;
  progress?: number;
  file?: string;
};

export type RunnableLocalModelAvailability = {
  modelId: typeof RUNNABLE_LOCAL_MODEL_ID;
  label: typeof RUNNABLE_LOCAL_MODEL_LABEL;
  dtype: typeof RUNNABLE_LOCAL_MODEL_DTYPE;
  status: "ready" | "degraded" | "unavailable";
  device: LocalModelDevice;
  reasons: string[];
};

export type FutureLocalModelRecommendation = {
  tier: "gemma-4-e2b" | "gemma-4-e4b";
  label: string;
  reason: string;
};

export const LOCAL_AI_FUTURE_MODEL_RECOMMENDATIONS = [
  {
    tier: "gemma-4-e2b",
    label: "Gemma 4 E2B recommendation",
    reason: "Use as the lighter Gemma 4 path when WebGPU is available but memory headroom looks limited.",
  },
  {
    tier: "gemma-4-e4b",
    label: "Gemma 4 E4B recommendation",
    reason: "Use as the main on-device target on stronger Macs after explicit model-package verification.",
  },
] as const satisfies readonly FutureLocalModelRecommendation[];

export type LocalModelEngineState = {
  recommendation: ModelRecommendation;
  runnableModel: RunnableLocalModelAvailability;
  futureRecommendations: readonly FutureLocalModelRecommendation[];
  cloudFallbackAvailable: false;
};

export type LocalModelRuntimeSnapshot = {
  status: LocalModelStatus;
  modelId: string;
  label: string;
  dtype: string;
  device: LocalModelDevice;
  detail: string;
  progress?: number;
  lastAnswer?: string;
};

export type LocalModelGenerateOptions = {
  maxNewTokens?: number;
  localContext?: string;
  systemPrompt?: string;
  doSample?: boolean;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  onToken?: (text: string) => void;
};

type PipelineProgress = {
  status?: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type PipelineOptions = {
  dtype?: string;
  device?: LocalModelDevice;
  progress_callback?: (progress: PipelineProgress) => void;
};

type TextGenerationOptions = {
  max_new_tokens: number;
  do_sample: boolean;
  return_full_text: false;
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
  streamer?: unknown;
};

type TextGenerationPipeline = {
  tokenizer?: object;
  (messages: LocalChatMessage[] | string, options?: TextGenerationOptions): Promise<unknown>;
};

type TransformersRuntime = {
  pipeline(task: "text-generation", model: typeof RUNNABLE_LOCAL_MODEL_ID, options?: PipelineOptions): Promise<TextGenerationPipeline>;
  TextStreamer?: new (
    tokenizer: object,
    options?: {
      skip_prompt?: boolean;
      skip_special_tokens?: boolean;
      callback_function?: (text: string) => void;
    },
  ) => unknown;
};

export type LoadedRunnableLocalModel = {
  modelId: typeof RUNNABLE_LOCAL_MODEL_ID;
  label: typeof RUNNABLE_LOCAL_MODEL_LABEL;
  dtype: string;
  device: LocalModelDevice;
  generator: TextGenerationPipeline;
  runtime: TransformersRuntime;
};

export type LoadRunnableLocalModelOptions = {
  transformers?: TransformersRuntime;
  dtype?: string;
  preferWebGPU?: boolean;
  onProgress?: (progress: LocalModelProgress) => void;
};

export type GenerateLocalModelAnswerOptions = LoadRunnableLocalModelOptions &
  LocalModelGenerateOptions & {
    engine?: LoadedRunnableLocalModel;
    messages?: LocalChatMessage[];
  };

let cachedEngine: LoadedRunnableLocalModel | undefined;
let cachedRuntime: TransformersRuntime | undefined;

export function resetLocalModelEngineForTests(): void {
  cachedEngine = undefined;
  cachedRuntime = undefined;
  sharedBrowserLocalModelEngine = undefined;
}

export function chooseLocalModelDevice(signals: CapabilitySignals): LocalModelDevice {
  return signals.webGPU ? "webgpu" : "cpu";
}

export function getRunnableLocalModelAvailability(signals: CapabilitySignals): RunnableLocalModelAvailability {
  if (!signals.indexedDB) {
    return {
      modelId: RUNNABLE_LOCAL_MODEL_ID,
      label: RUNNABLE_LOCAL_MODEL_LABEL,
      dtype: RUNNABLE_LOCAL_MODEL_DTYPE,
      status: "unavailable",
      device: chooseLocalModelDevice(signals),
      reasons: ["Browser-local storage is required for model/session state; no server fallback is used."],
    };
  }

  const webgpu = signals.webGPU;
  return {
    modelId: RUNNABLE_LOCAL_MODEL_ID,
    label: RUNNABLE_LOCAL_MODEL_LABEL,
    dtype: RUNNABLE_LOCAL_MODEL_DTYPE,
    status: webgpu ? "ready" : "degraded",
    device: chooseLocalModelDevice(signals),
    reasons: webgpu
      ? ["WebGPU is available for the runnable Gemma 270M smoke model."]
      : ["WebGPU is unavailable; Transformers.js will use CPU/WASM execution with degraded speed."],
  };
}

export function createLocalModelEngineState(signals: CapabilitySignals): LocalModelEngineState {
  return {
    recommendation: recommendLocalModel(signals),
    runnableModel: getRunnableLocalModelAvailability(signals),
    futureRecommendations: LOCAL_AI_FUTURE_MODEL_RECOMMENDATIONS,
    cloudFallbackAvailable: false,
  };
}

async function importTransformersRuntime(): Promise<TransformersRuntime> {
  if (!cachedRuntime) {
    cachedRuntime = (await import("@huggingface/transformers")) as unknown as TransformersRuntime;
  }
  return cachedRuntime;
}

function normalizeProgress(progress: PipelineProgress): LocalModelProgress {
  const file = progress.file ?? progress.name;
  let percent = progress.progress;
  if (typeof percent === "number" && percent <= 1) {
    percent *= 100;
  }
  if (typeof percent !== "number" && typeof progress.loaded === "number" && typeof progress.total === "number" && progress.total > 0) {
    percent = (progress.loaded / progress.total) * 100;
  }

  return {
    status: progress.status === "ready" ? "ready" : "loading",
    message: file ? `${file}${typeof percent === "number" ? ` ${Math.round(percent)}%` : ""}` : progress.status ?? "Loading model assets",
    progress: typeof percent === "number" ? Math.min(Math.max(Math.round(percent), 0), 100) : undefined,
    file,
  };
}

export async function loadRunnableLocalModel(options: LoadRunnableLocalModelOptions = {}): Promise<LoadedRunnableLocalModel> {
  const dtype = options.dtype ?? RUNNABLE_LOCAL_MODEL_DTYPE;
  const preferWebGPU = options.preferWebGPU ?? false;
  const device: LocalModelDevice = preferWebGPU ? "webgpu" : "cpu";

  if (cachedEngine && cachedEngine.dtype === dtype && cachedEngine.device === device) {
    options.onProgress?.({ status: "ready", message: `${RUNNABLE_LOCAL_MODEL_LABEL} already loaded`, progress: 100 });
    return cachedEngine;
  }

  const runtime = options.transformers ?? (await importTransformersRuntime());
  options.onProgress?.({ status: "loading", message: `Downloading/loading ${RUNNABLE_LOCAL_MODEL_LABEL}`, progress: 0 });

  const pipelineOptions: PipelineOptions = {
    dtype,
    progress_callback: (progress) => options.onProgress?.(normalizeProgress(progress)),
  };
  if (preferWebGPU) {
    pipelineOptions.device = "webgpu";
  }

  const generator = await runtime.pipeline("text-generation", RUNNABLE_LOCAL_MODEL_ID, pipelineOptions);

  cachedEngine = {
    modelId: RUNNABLE_LOCAL_MODEL_ID,
    label: RUNNABLE_LOCAL_MODEL_LABEL,
    dtype,
    device,
    generator,
    runtime,
  };
  options.onProgress?.({ status: "ready", message: `${RUNNABLE_LOCAL_MODEL_LABEL} loaded locally`, progress: 100 });
  return cachedEngine;
}

export function createLocalChatMessages(prompt: string, localContext?: string, systemPrompt?: string): LocalChatMessage[] {
  const content = localContext?.trim()
    ? `Local context available in this browser tab:\n${localContext}\n\nUser request:\n${prompt}`
    : prompt;

  return [
    {
      role: "system",
      content:
        systemPrompt ??
        "You are Local Agent, a browser-local assistant. Answer concisely. Do not claim that a server, shell, localhost bridge, cloud fallback, or existing chat queue was used.",
    },
    { role: "user", content },
  ];
}

function lastAssistantContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (item && typeof item === "object" && "content" in item) {
      const content = (item as { content?: unknown }).content;
      if (typeof content === "string" && content.trim()) return content.trim();
    }
  }
  return undefined;
}

export function extractGeneratedTextFromPipelineOutput(output: unknown, promptToStrip = ""): string {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "string") {
    return first.startsWith(promptToStrip) ? first.slice(promptToStrip.length).trim() : first.trim();
  }
  if (!first || typeof first !== "object" || !("generated_text" in first)) return "";

  const generated = (first as { generated_text?: unknown }).generated_text;
  if (typeof generated === "string") {
    return generated.startsWith(promptToStrip) ? generated.slice(promptToStrip.length).trim() : generated.trim();
  }
  return lastAssistantContent(generated) ?? "";
}

export const normalizeGeneratedText = extractGeneratedTextFromPipelineOutput;

export async function generateLocalModelAnswer(
  prompt: string,
  options: GenerateLocalModelAnswerOptions = {},
): Promise<{ text: string; modelId: typeof RUNNABLE_LOCAL_MODEL_ID; device: LocalModelDevice }> {
  const engine = options.engine ?? (await loadRunnableLocalModel(options));
  const chunks: string[] = [];
  const streamer = options.onToken && engine.runtime.TextStreamer && engine.generator.tokenizer
    ? new engine.runtime.TextStreamer(engine.generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text) => {
          chunks.push(text);
          options.onToken?.(text);
        },
      })
    : undefined;

  const messages = options.messages ?? createLocalChatMessages(prompt, options.localContext, options.systemPrompt);
  const output = await engine.generator(messages, {
    max_new_tokens: options.maxNewTokens ?? LOCAL_AI_DEFAULT_MAX_NEW_TOKENS,
    do_sample: options.doSample ?? false,
    return_full_text: false,
    temperature: options.temperature,
    top_p: options.topP,
    repetition_penalty: options.repetitionPenalty,
    streamer,
  });

  const text = extractGeneratedTextFromPipelineOutput(output, prompt) || chunks.join("").trim();
  return { text, modelId: RUNNABLE_LOCAL_MODEL_ID, device: engine.device };
}

export class BrowserLocalModelEngine {
  private snapshot: LocalModelRuntimeSnapshot;
  private engine?: LoadedRunnableLocalModel;

  constructor(
    private readonly options: {
      signals: CapabilitySignals;
      transformers?: TransformersRuntime;
      onStatusChange?: (snapshot: LocalModelRuntimeSnapshot) => void;
    },
  ) {
    this.snapshot = {
      status: "idle",
      modelId: RUNNABLE_LOCAL_MODEL_ID,
      label: RUNNABLE_LOCAL_MODEL_LABEL,
      dtype: RUNNABLE_LOCAL_MODEL_DTYPE,
      device: chooseLocalModelDevice(options.signals),
      detail: `${RUNNABLE_LOCAL_MODEL_LABEL} is ready to download into the browser runtime.`,
    };
  }

  getSnapshot(): LocalModelRuntimeSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<LocalModelRuntimeSnapshot>): LocalModelRuntimeSnapshot {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onStatusChange?.(this.snapshot);
    return this.snapshot;
  }

  async load(): Promise<LocalModelRuntimeSnapshot> {
    this.emit({ status: "loading", detail: `Downloading/loading ${RUNNABLE_LOCAL_MODEL_LABEL}` });
    this.engine = await loadRunnableLocalModel({
      transformers: this.options.transformers,
      dtype: RUNNABLE_LOCAL_MODEL_DTYPE,
      preferWebGPU: this.snapshot.device === "webgpu",
      onProgress: (progress) => {
        this.emit({ status: progress.status, detail: progress.message, progress: progress.progress });
      },
    });
    return this.emit({ status: "ready", detail: `${RUNNABLE_LOCAL_MODEL_LABEL} loaded locally`, progress: 100 });
  }

  async generate(prompt: string, options: LocalModelGenerateOptions = {}): Promise<string> {
    const engine = this.engine ?? (await this.load().then(() => this.engine));
    if (!engine) throw new Error("Local model runtime did not initialize.");
    this.emit({ status: "generating", detail: "Generating with the browser-local Gemma 270M runtime." });
    const answer = await generateLocalModelAnswer(prompt, { ...options, engine });
    this.emit({ status: "ready", detail: "Local model answer generated in this browser tab.", lastAnswer: answer.text, progress: 100 });
    return answer.text;
  }
}

export function createBrowserLocalModelEngine(options: ConstructorParameters<typeof BrowserLocalModelEngine>[0]): BrowserLocalModelEngine {
  return new BrowserLocalModelEngine(options);
}

let sharedBrowserLocalModelEngine: BrowserLocalModelEngine | undefined;

export type BrowserLocalModelLoadOptions = {
  modelId?: string;
  onProgress?: (progress: LocalModelRuntimeSnapshot) => void;
};

export type BrowserLocalModelGenerateRequest = {
  prompt: string;
  modelId?: string;
  model?: unknown;
  session?: unknown;
  onProgress?: (progress: LocalModelRuntimeSnapshot) => void;
  maxNewTokens?: number;
  localContext?: string;
};

function getSharedBrowserLocalModelEngine(onProgress?: (progress: LocalModelRuntimeSnapshot) => void): BrowserLocalModelEngine {
  if (!sharedBrowserLocalModelEngine) {
    sharedBrowserLocalModelEngine = createBrowserLocalModelEngine({
      signals: probeLocalAiCapabilities(),
      onStatusChange: onProgress,
    });
  }
  return sharedBrowserLocalModelEngine;
}

export async function loadBrowserLocalModel(options: BrowserLocalModelLoadOptions = {}): Promise<BrowserLocalModelEngine> {
  if (options.modelId && options.modelId !== RUNNABLE_LOCAL_MODEL_ID) {
    throw new Error(`Unsupported Local Agent model: ${options.modelId}. Use ${RUNNABLE_LOCAL_MODEL_ID}.`);
  }
  const engine = getSharedBrowserLocalModelEngine(options.onProgress);
  await engine.load();
  return engine;
}

export async function generateBrowserLocalAnswer(
  request: BrowserLocalModelGenerateRequest,
): Promise<{ answer: string; text: string; modelId: typeof RUNNABLE_LOCAL_MODEL_ID; device: LocalModelDevice }> {
  if (request.modelId && request.modelId !== RUNNABLE_LOCAL_MODEL_ID) {
    throw new Error(`Unsupported Local Agent model: ${request.modelId}. Use ${RUNNABLE_LOCAL_MODEL_ID}.`);
  }
  const engine = request.session instanceof BrowserLocalModelEngine
    ? request.session
    : request.model instanceof BrowserLocalModelEngine
      ? request.model
      : await loadBrowserLocalModel({ onProgress: request.onProgress });
  const answer = await engine.generate(request.prompt, {
    maxNewTokens: request.maxNewTokens,
    localContext: request.localContext,
  });
  return { answer, text: answer, modelId: RUNNABLE_LOCAL_MODEL_ID, device: engine.getSnapshot().device };
}

export async function rejectCloudModelFallback(): Promise<never> {
  throw new Error("Cloud LLM fallback is disabled for Local Agent v1; model execution must stay browser-local.");
}
