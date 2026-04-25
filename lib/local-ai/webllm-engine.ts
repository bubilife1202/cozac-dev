import type { LocalModelDevice } from "./model-engine";

export const WEBLLM_DEFAULT_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC" as const;
export const WEBLLM_DEFAULT_MODEL_LABEL = "WebLLM Qwen2.5 0.5B Instruct (q4f32)" as const;
export const WEBLLM_DEFAULT_MODEL_DETAIL =
  "WebLLM prebuilt q4f32 model: no fp16 shader requirement, downloads into browser cache, then answers inside the tab." as const;

export type WebLlmBrowserModel = {
  id: string;
  label: string;
  shortLabel: string;
  sizeLabel: string;
  speedLabel: "Fast" | "Balanced" | "Strong" | "Heavy";
  description: string;
};

export const WEBLLM_BROWSER_MODELS: WebLlmBrowserModel[] = [
  {
    id: WEBLLM_DEFAULT_MODEL_ID,
    label: WEBLLM_DEFAULT_MODEL_LABEL,
    shortLabel: "Qwen2.5 0.5B",
    sizeLabel: "0.5B",
    speedLabel: "Fast",
    description: "가장 빠른 첫 다운로드용 기본 모델. q4f32라 브라우저 호환성이 좋습니다.",
  },
  {
    id: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    label: "WebLLM SmolLM2 360M Instruct (q4f32)",
    shortLabel: "SmolLM2 360M",
    sizeLabel: "360M",
    speedLabel: "Fast",
    description: "가벼운 테스트와 저사양 브라우저용 초소형 모델입니다.",
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC",
    label: "WebLLM TinyLlama 1.1B Chat (q4f32)",
    shortLabel: "TinyLlama 1.1B",
    sizeLabel: "1.1B",
    speedLabel: "Balanced",
    description: "작지만 대화형 응답 느낌을 보기 좋은 경량 모델입니다.",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "WebLLM Llama 3.2 1B Instruct (q4f32)",
    shortLabel: "Llama 3.2 1B",
    sizeLabel: "1B",
    speedLabel: "Balanced",
    description: "브라우저에서 시도하기 좋은 범용 1B급 모델입니다.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    label: "WebLLM Qwen2.5 1.5B Instruct (q4f32)",
    shortLabel: "Qwen2.5 1.5B",
    sizeLabel: "1.5B",
    speedLabel: "Strong",
    description: "조금 더 나은 답변 품질을 노리는 데스크톱용 선택지입니다.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f32_1-MLC",
    label: "WebLLM Phi 3.5 Mini Instruct (q4f32)",
    shortLabel: "Phi 3.5 Mini",
    sizeLabel: "Mini",
    speedLabel: "Heavy",
    description: "더 무거운 품질 후보입니다. WebGPU 메모리 여유가 있는 Chrome/Edge에서만 권장합니다.",
  },
];

export function getWebLlmBrowserModel(modelId?: string): WebLlmBrowserModel {
  return WEBLLM_BROWSER_MODELS.find((model) => model.id === modelId) ?? WEBLLM_BROWSER_MODELS[0];
}

export type WebLlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type WebLlmProgress = {
  status: "idle" | "loading" | "ready" | "generating" | "error";
  message: string;
  progress?: number;
};

type WebLlmInitProgressReport = {
  text?: string;
  progress?: number;
  timeElapsed?: number;
};

type WebLlmCompletionChoice = {
  text?: string;
  delta?: { content?: string };
  message?: { content?: string | Array<{ text?: string; content?: string }> };
};

type WebLlmCompletionResponse = {
  choices?: WebLlmCompletionChoice[];
};

export type WebLlmCompletionRequest = {
  messages: WebLlmChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

export type WebLlmEngine = {
  chat: {
    completions: {
      create(request: WebLlmCompletionRequest): Promise<WebLlmCompletionResponse | AsyncIterable<WebLlmCompletionResponse>>;
    };
  };
  unload?(): Promise<void> | void;
};

export type WebLlmRuntime = {
  CreateMLCEngine(
    modelId: string,
    options?: {
      initProgressCallback?: (report: WebLlmInitProgressReport) => void;
    },
  ): Promise<WebLlmEngine>;
};

export type LoadedWebLlmLocalModel = {
  kind: "webllm";
  modelId: string;
  label: string;
  device: Extract<LocalModelDevice, "webgpu">;
  engine: WebLlmEngine;
};

export type LoadWebLlmLocalModelOptions = {
  runtime?: WebLlmRuntime;
  modelId?: string;
  onProgress?: (progress: WebLlmProgress) => void;
};

export type GenerateWebLlmAnswerOptions = {
  engine?: LoadedWebLlmLocalModel;
  runtime?: WebLlmRuntime;
  messages?: WebLlmChatMessage[];
  localContext?: string;
  systemPrompt?: string;
  maxNewTokens?: number;
  temperature?: number;
  onToken?: (text: string) => void;
  onProgress?: (progress: WebLlmProgress) => void;
};

let cachedWebLlmEngine: LoadedWebLlmLocalModel | undefined;

export function resetWebLlmEngineForTests(): void {
  cachedWebLlmEngine = undefined;
}

async function importWebLlmRuntime(): Promise<WebLlmRuntime> {
  const runtime = (await import("@mlc-ai/web-llm")) as Partial<WebLlmRuntime>;
  if (typeof runtime.CreateMLCEngine !== "function") {
    throw new Error("@mlc-ai/web-llm did not expose CreateMLCEngine.");
  }
  return { CreateMLCEngine: runtime.CreateMLCEngine };
}

function normalizeProgress(report: WebLlmInitProgressReport): WebLlmProgress {
  const rawProgress = typeof report.progress === "number" && Number.isFinite(report.progress)
    ? report.progress <= 1
      ? report.progress * 100
      : report.progress
    : undefined;

  return {
    status: rawProgress && rawProgress >= 100 ? "ready" : "loading",
    message: report.text?.trim() || "Downloading/loading WebLLM model assets...",
    progress: typeof rawProgress === "number" ? Math.min(Math.max(Math.round(rawProgress), 0), 100) : undefined,
  };
}

export function createWebLlmChatMessages(
  prompt: string,
  localContext?: string,
  systemPrompt?: string,
): WebLlmChatMessage[] {
  const content = localContext?.trim()
    ? `Local context available in this browser tab:\n${localContext}\n\nUser request:\n${prompt}`
    : prompt;

  return [
    {
      role: "system",
      content:
        systemPrompt ??
        "You are Local Agent running fully inside this browser tab through WebLLM. Answer concisely in the user's language. Do not claim cloud, server, shell, or localhost fallback was used.",
    },
    { role: "user", content },
  ];
}

function toWebLlmLoadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/compatible GPU|No available adapters|WebGPU|adapter/i.test(message)) {
    return new Error(
      "WebGPU를 사용할 수 없어 WebLLM 모델을 시작하지 못했습니다. Chrome/Edge에서 하드웨어 가속과 WebGPU가 켜져 있는지 확인하세요.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

export async function loadWebLlmLocalModel(
  options: LoadWebLlmLocalModelOptions = {},
): Promise<LoadedWebLlmLocalModel> {
  const selectedModel = getWebLlmBrowserModel(options.modelId);

  if (cachedWebLlmEngine && !options.runtime && cachedWebLlmEngine.modelId === selectedModel.id) {
    options.onProgress?.({ status: "ready", message: `${cachedWebLlmEngine.label} already loaded`, progress: 100 });
    return cachedWebLlmEngine;
  }

  if (cachedWebLlmEngine && !options.runtime && cachedWebLlmEngine.modelId !== selectedModel.id) {
    await cachedWebLlmEngine.engine.unload?.();
    cachedWebLlmEngine = undefined;
  }

  const runtime = options.runtime ?? (await importWebLlmRuntime());
  options.onProgress?.({ status: "loading", message: `Downloading/loading ${selectedModel.label}`, progress: 0 });

  let engine: WebLlmEngine;
  try {
    engine = await runtime.CreateMLCEngine(selectedModel.id, {
      initProgressCallback(report) {
        options.onProgress?.(normalizeProgress(report));
      },
    });
  } catch (error) {
    throw toWebLlmLoadError(error);
  }

  const loaded: LoadedWebLlmLocalModel = {
    kind: "webllm",
    modelId: selectedModel.id,
    label: selectedModel.label,
    device: "webgpu",
    engine,
  };

  if (!options.runtime) {
    cachedWebLlmEngine = loaded;
  }

  options.onProgress?.({ status: "ready", message: `${selectedModel.label} ready`, progress: 100 });
  return loaded;
}

function stringifyMessageContent(content: string | Array<{ text?: string; content?: string }> | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? part.content ?? "").join("");
  }
  return "";
}

export function extractWebLlmAnswerText(response: unknown): string {
  const choices = (response as WebLlmCompletionResponse | undefined)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  return (
    stringifyMessageContent(first?.message?.content) ||
    first?.text ||
    first?.delta?.content ||
    ""
  ).replace(/\s+/g, " ").trim();
}

async function collectStreamingAnswer(
  stream: AsyncIterable<WebLlmCompletionResponse>,
  onToken?: (text: string) => void,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    const text = extractWebLlmAnswerText(chunk);
    if (!text) continue;
    chunks.push(text);
    onToken?.(text);
  }
  return chunks.join("").trim();
}

function isAsyncIterable(value: unknown): value is AsyncIterable<WebLlmCompletionResponse> {
  return typeof (value as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator] === "function";
}

export async function generateWebLlmAnswer(
  prompt: string,
  options: GenerateWebLlmAnswerOptions = {},
): Promise<{ text: string; answer: string; modelId: string; device: "webgpu" }> {
  const engine = options.engine ?? (await loadWebLlmLocalModel({ runtime: options.runtime, onProgress: options.onProgress }));
  const messages = options.messages ?? createWebLlmChatMessages(prompt, options.localContext, options.systemPrompt);
  options.onProgress?.({ status: "generating", message: `Generating with ${engine.label}...` });

  const response = await engine.engine.chat.completions.create({
    messages,
    max_tokens: options.maxNewTokens ?? 96,
    temperature: options.temperature ?? 0.2,
    stream: Boolean(options.onToken),
  });

  const text = isAsyncIterable(response)
    ? await collectStreamingAnswer(response, options.onToken)
    : extractWebLlmAnswerText(response);
  const answer = text || "The WebLLM local model returned an empty response.";
  return { text: answer, answer, modelId: engine.modelId, device: "webgpu" };
}

export async function loadBrowserLocalModel(options: LoadWebLlmLocalModelOptions = {}): Promise<LoadedWebLlmLocalModel> {
  return loadWebLlmLocalModel(options);
}

export async function generateBrowserLocalAnswer(request: {
  prompt: string;
  modelId?: string;
  model?: unknown;
  session?: unknown;
  localContext?: string;
  onProgress?: (progress: WebLlmProgress) => void;
  maxNewTokens?: number;
}): Promise<{ answer: string; text: string; modelId: string; device: "webgpu" }> {
  const session = request.session && typeof request.session === "object" && (request.session as LoadedWebLlmLocalModel).kind === "webllm"
    ? request.session as LoadedWebLlmLocalModel
    : request.model && typeof request.model === "object" && (request.model as LoadedWebLlmLocalModel).kind === "webllm"
      ? request.model as LoadedWebLlmLocalModel
      : await loadWebLlmLocalModel({ modelId: request.modelId, onProgress: request.onProgress });

  return generateWebLlmAnswer(request.prompt, {
    engine: session,
    localContext: request.localContext,
    maxNewTokens: request.maxNewTokens,
    onProgress: request.onProgress,
  });
}
