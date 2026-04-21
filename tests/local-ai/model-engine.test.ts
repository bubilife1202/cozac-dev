import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNNABLE_LOCAL_MODEL_ID,
  createLocalChatMessages,
  createLocalModelEngineState,
  extractGeneratedTextFromPipelineOutput,
  generateLocalModelAnswer,
  getRunnableLocalModelAvailability,
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

test("exposes the 270M Gemma model as the runnable smoke model while keeping larger tiers as future recommendations", () => {
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
  assert.equal(state.futureRecommendations.some((item) => item.tier === "gemma-3-2b"), true);
  assert.equal(state.futureRecommendations.some((item) => item.tier === "gemma-3-4b"), true);
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

test("lazy-loads Transformers.js text-generation with the Gemma 270M model", async () => {
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

test("keeps cloud fallback explicitly disabled", async () => {
  await assert.rejects(rejectCloudModelFallback(), /Cloud LLM fallback is disabled/);
});
