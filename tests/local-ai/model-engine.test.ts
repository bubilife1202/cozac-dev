import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNNABLE_LOCAL_MODEL_ID,
  chooseLocalModelDevice,
  createLocalChatMessages,
  createLocalModelEngineState,
  extractGeneratedTextFromPipelineOutput,
  generateLocalModelAnswer,
  getRunnableLocalModelAvailability,
  loadBrowserLocalModel,
  loadRunnableLocalModel,
  rejectCloudModelFallback,
  resetLocalModelEngineForTests,
  type LocalChatMessage,
} from "../../lib/local-ai/model-engine";

function createMockTransformers(answer = "Mock local answer") {
  const calls: Array<{ task: string; model: string; options: Record<string, unknown> }> = [];
  const generatedInputs: Array<{ input: LocalChatMessage[] | string; options: Record<string, unknown> | undefined }> = [];

  return {
    calls,
    generatedInputs,
    module: {
      async pipeline(task: "text-generation", model: string, options?: Record<string, unknown>) {
        calls.push({ task, model, options: options ?? {} });
        const progress = options?.progress_callback;
        if (typeof progress === "function") {
          progress({ status: "download", name: model, file: "onnx/model.onnx" });
          progress({ status: "progress", name: model, file: "onnx/model.onnx", progress: 50, loaded: 5, total: 10 });
        }

        const generator = async (input: LocalChatMessage[] | string, generationOptions?: Record<string, unknown>) => {
          generatedInputs.push({ input, options: generationOptions });
          return [
            {
              generated_text: [
                { role: "user", content: "Question" },
                { role: "assistant", content: answer },
              ],
            },
          ];
        };
        return Object.assign(generator, { tokenizer: { mock: true } });
      },
      TextStreamer: class MockTextStreamer {
        constructor(...args: unknown[]) {
          assert.equal(args.length, 2);
        }
      },
    },
  };
}

test("exposes the phone-safe SmolLM2 model as the runnable smoke model while keeping Gemma 4 tiers as future recommendations", () => {
  const state = createLocalModelEngineState({
    fileSystemAccess: true,
    webGPU: true,
    indexedDB: true,
    cpuCores: 8,
    memoryGB: 12,
    browserName: "Chromium",
    osHint: "macOS",
  });

  assert.equal(state.cloudFallbackAvailable, false);
  assert.equal(state.runnableModel.modelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.equal(state.runnableModel.status, "ready");
  assert.equal(state.futureRecommendations.some((item) => item.tier === "gemma-4-e2b"), true);
  assert.equal(state.futureRecommendations.some((item) => item.tier === "gemma-4-e4b"), true);
});

test("reports runnable model availability without requiring a cloud fallback", () => {
  const degraded = getRunnableLocalModelAvailability({
    fileSystemAccess: true,
    webGPU: false,
    indexedDB: true,
    browserName: "Safari",
    osHint: "macOS",
  });
  const unavailable = getRunnableLocalModelAvailability({
    fileSystemAccess: true,
    webGPU: true,
    indexedDB: false,
    browserName: "Chromium",
    osHint: "macOS",
  });

  assert.equal(degraded.status, "degraded");
  assert.match(degraded.reasons.join(" "), /WASM/);
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.reasons.join(" "), /storage/);
});

test("uses CPU/WASM instead of WebGPU for phone-like browsers even when navigator.gpu exists", () => {
  const device = chooseLocalModelDevice({
    fileSystemAccess: true,
    webGPU: true,
    indexedDB: true,
    browserName: "Chromium",
    osHint: "Android",
  });

  assert.equal(device, "cpu");
});

test("lazy-loads Transformers.js text-generation with the phone-safe local model", async () => {
  resetLocalModelEngineForTests();
  const mock = createMockTransformers();
  const progressMessages: string[] = [];

  const engine = await loadRunnableLocalModel({
    transformers: mock.module,
    dtype: "fp32",
    preferWebGPU: false,
    onProgress(progress) {
      progressMessages.push(progress.message);
    },
  });

  assert.equal(engine.modelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.equal(engine.device, "cpu");
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0]?.task, "text-generation");
  assert.equal(mock.calls[0]?.model, RUNNABLE_LOCAL_MODEL_ID);
  assert.equal(mock.calls[0]?.options.dtype, "fp32");
  assert.equal("device" in (mock.calls[0]?.options ?? {}), false);
  assert.equal(progressMessages.some((message) => message.includes("onnx/model.onnx")), true);
});

test("falls back to CPU when WebGPU reports no available adapter", async () => {
  resetLocalModelEngineForTests();
  const calls: Array<{ task: string; model: string; options: Record<string, unknown> }> = [];
  const transformersRuntime = {
    async pipeline(task: "text-generation", model: string, options?: Record<string, unknown>) {
      calls.push({ task, model, options: options ?? {} });
      if (options?.device === "webgpu") {
        throw new Error("No available adapters.");
      }
      const generator = async () => [{ generated_text: "CPU fallback answer" }];
      return Object.assign(generator, { tokenizer: { mock: true } });
    },
  };

  const engine = await loadRunnableLocalModel({ transformers: transformersRuntime, preferWebGPU: true });

  assert.equal(engine.device, "cpu");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.options.device, "webgpu");
  assert.equal(calls[1]?.options.device, "wasm");
});

test("falls back to CPU when WebGPU backend creation fails without an adapter", async () => {
  resetLocalModelEngineForTests();
  const calls: Array<{ task: string; model: string; options: Record<string, unknown> }> = [];
  const transformersRuntime = {
    async pipeline(task: "text-generation", model: string, options?: Record<string, unknown>) {
      calls.push({ task, model, options: options ?? {} });
      if (options?.device === "webgpu") {
        throw new Error('no available backend found. ERR: [webgpu] Error: Failed to get GPU adapter.');
      }
      const generator = async () => [{ generated_text: "CPU fallback answer" }];
      return Object.assign(generator, { tokenizer: { mock: true } });
    },
  };

  const engine = await loadRunnableLocalModel({ transformers: transformersRuntime, preferWebGPU: true });

  assert.equal(engine.device, "cpu");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.options.device, "webgpu");
  assert.equal(calls[1]?.options.device, "wasm");
});

test("generates a local answer from chat messages and strips pipeline chat output", async () => {
  resetLocalModelEngineForTests();
  const mock = createMockTransformers("Use the selected folder only.");

  const answer = await generateLocalModelAnswer("How should Local Agent work?", {
    transformers: mock.module,
    preferWebGPU: false,
    maxNewTokens: 24,
    onToken() {},
  });

  assert.equal(answer.modelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.equal(answer.text, "Use the selected folder only.");
  assert.equal(Array.isArray(mock.generatedInputs[0]?.input), true);
  assert.equal(mock.generatedInputs[0]?.options?.max_new_tokens, 24);
  assert.equal(mock.generatedInputs[0]?.options?.return_full_text, false);
  assert.ok(mock.generatedInputs[0]?.options?.streamer);
});

test("formats default chat messages with a local-only system instruction", () => {
  const messages = createLocalChatMessages("Summarize README.md");

  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /browser-local/);
  assert.equal(messages[1]?.role, "user");
  assert.equal(messages[1]?.content, "Summarize README.md");
});

test("extracts string and chat outputs from Transformers.js pipeline results", () => {
  assert.equal(extractGeneratedTextFromPipelineOutput([{ generated_text: "Prompt Answer" }], "Prompt"), "Answer");
  assert.equal(
    extractGeneratedTextFromPipelineOutput([
      {
        generated_text: [
          { role: "user", content: "Question" },
          { role: "assistant", content: "Answer" },
        ],
      },
    ]),
    "Answer",
  );
});

test("loads Gemma 4 E2B through AutoModelForImageTextToText with per-component dtype and CPU/WASM device", async () => {
  resetLocalModelEngineForTests();
  const calls: Array<{ kind: string; model: string; options: Record<string, unknown> }> = [];
  const runtime = {
    AutoProcessor: {
      async from_pretrained(model: string, options?: Record<string, unknown>) {
        calls.push({ kind: "processor", model, options: options ?? {} });
        return {
          apply_chat_template() {
            return "formatted prompt";
          },
          async call() {
            return { input_ids: { dims: [1, 4] } };
          },
          async batch_decode() {
            return ["Gemma 4 E2B answered locally."];
          },
        };
      },
    },
    AutoModelForImageTextToText: {
      async from_pretrained(model: string, options?: Record<string, unknown>) {
        calls.push({ kind: "model", model, options: options ?? {} });
        return {
          async generate() {
            return { slice: () => "tokens" };
          },
        };
      },
    },
  };

  const engine = await loadBrowserLocalModel({
    modelId: "onnx-community/gemma-4-E2B-it-ONNX",
    transformers: runtime,
    signals: {
      fileSystemAccess: true,
      webGPU: true,
      indexedDB: true,
      browserName: "Chromium",
      osHint: "Android",
    },
  });

  const modelCall = calls.find((call) => call.kind === "model");
  assert.equal(modelCall?.model, "onnx-community/gemma-4-E2B-it-ONNX");
  assert.deepEqual(modelCall?.options.dtype, {
    embed_tokens: "q8",
    audio_encoder: "q8",
    vision_encoder: "fp16",
    decoder_model_merged: "q4",
  });
  assert.equal(modelCall?.options.device, "wasm");
  assert.equal(engine.getSnapshot().status, "ready");
});

test("invokes callable Gemma 4 processors without using Function.prototype.call", async () => {
  resetLocalModelEngineForTests();
  let receivedPrompt = "";
  const runtime = {
    AutoProcessor: {
      async from_pretrained() {
        const processor = Object.assign(
          async (prompt: string) => {
            receivedPrompt = prompt;
            return { input_ids: { dims: [1, 2] } };
          },
          {
            apply_chat_template() {
              return "callable formatted prompt";
            },
            async batch_decode() {
              return ["Callable processor answered locally."];
            },
          },
        );
        return processor;
      },
    },
    AutoModelForImageTextToText: {
      async from_pretrained() {
        return {
          async generate() {
            return { slice: () => "tokens" };
          },
        };
      },
    },
  };

  const engine = await loadBrowserLocalModel({
    modelId: "onnx-community/gemma-4-E2B-it-ONNX",
    transformers: runtime,
    signals: {
      fileSystemAccess: true,
      webGPU: false,
      indexedDB: true,
      browserName: "Chromium",
      osHint: "Linux",
    },
  });
  const answer = await engine.generate("hello");

  assert.equal(receivedPrompt, "callable formatted prompt");
  assert.equal(answer, "Callable processor answered locally.");
});

test("keeps cloud fallback explicitly disabled", async () => {
  await assert.rejects(rejectCloudModelFallback(), /Cloud LLM fallback is disabled/);
});
