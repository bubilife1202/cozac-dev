import type { LocalModelDevice } from "./model-engine";

export const WEBLLM_DEFAULT_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC" as const;
export const WEBLLM_DEFAULT_MODEL_LABEL = "WebLLM Qwen2.5 0.5B Instruct (q4f32)" as const;
export const WEBLLM_DEFAULT_MODEL_DETAIL =
  "WebLLM prebuilt q4f32 model: no fp16 shader requirement, downloads into browser cache, then answers inside the tab." as const;

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
  modelId: typeof WEBLLM_DEFAULT_MODEL_ID;
  label: typeof WEBLLM_DEFAULT_MODEL_LABEL;
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

export async function loadWebLlmLocalModel(
  options: LoadWebLlmLocalModelOptions = {},
): Promise<LoadedWebLlmLocalModel> {
  const modelId = options.modelId ?? WEBLLM_DEFAULT_MODEL_ID;
  if (modelId !== WEBLLM_DEFAULT_MODEL_ID) {
    throw new Error(
      `${modelId} is not the WebLLM fast default. Use ${WEBLLM_DEFAULT_MODEL_ID} for the first-click browser chat path; Gemma tiers stay advanced candidates until separately proven.`,
    );
  }

  if (cachedWebLlmEngine && !options.runtime) {
    options.onProgress?.({ status: "ready", message: `${WEBLLM_DEFAULT_MODEL_LABEL} already loaded`, progress: 100 });
    return cachedWebLlmEngine;
  }

  const runtime = options.runtime ?? (await importWebLlmRuntime());
  options.onProgress?.({ status: "loading", message: `Downloading/loading ${WEBLLM_DEFAULT_MODEL_LABEL}`, progress: 0 });

  const engine = await runtime.CreateMLCEngine(WEBLLM_DEFAULT_MODEL_ID, {
    initProgressCallback(report) {
      options.onProgress?.(normalizeProgress(report));
    },
  });

  const loaded: LoadedWebLlmLocalModel = {
    kind: "webllm",
    modelId: WEBLLM_DEFAULT_MODEL_ID,
    label: WEBLLM_DEFAULT_MODEL_LABEL,
    device: "webgpu",
    engine,
  };

  if (!options.runtime) {
    cachedWebLlmEngine = loaded;
  }

  options.onProgress?.({ status: "ready", message: `${WEBLLM_DEFAULT_MODEL_LABEL} ready`, progress: 100 });
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
): Promise<{ text: string; answer: string; modelId: typeof WEBLLM_DEFAULT_MODEL_ID; device: "webgpu" }> {
  const engine = options.engine ?? (await loadWebLlmLocalModel({ runtime: options.runtime, onProgress: options.onProgress }));
  const messages = options.messages ?? createWebLlmChatMessages(prompt, options.localContext, options.systemPrompt);
  options.onProgress?.({ status: "generating", message: `Generating with ${WEBLLM_DEFAULT_MODEL_LABEL}...` });

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
  return { text: answer, answer, modelId: WEBLLM_DEFAULT_MODEL_ID, device: "webgpu" };
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
}): Promise<{ answer: string; text: string; modelId: typeof WEBLLM_DEFAULT_MODEL_ID; device: "webgpu" }> {
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
