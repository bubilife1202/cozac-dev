import assert from "node:assert/strict";
import test from "node:test";

import {
  WEBLLM_DEFAULT_MODEL_ID,
  WEBLLM_DEFAULT_MODEL_LABEL,
  extractWebLlmAnswerText,
  generateWebLlmAnswer,
  loadWebLlmLocalModel,
  resetWebLlmEngineForTests,
  type WebLlmChatMessage,
} from "../../lib/local-ai/webllm-engine";

function createMockWebLlmRuntime(answer = "안녕하세요. 브라우저 안에서 로컬로 답하고 있습니다.") {
  const createCalls: Array<{ modelId: string; options: Record<string, unknown> }> = [];
  const completionCalls: Array<Record<string, unknown>> = [];
  const engine = {
    chat: {
      completions: {
        async create(request: Record<string, unknown>) {
          completionCalls.push(request);
          return {
            choices: [
              {
                message: {
                  content: answer,
                },
              },
            ],
          };
        },
      },
    },
  };

  return {
    createCalls,
    completionCalls,
    runtime: {
      async CreateMLCEngine(modelId: string, options: Record<string, unknown>) {
        createCalls.push({ modelId, options });
        const callback = options.initProgressCallback;
        if (typeof callback === "function") {
          callback({ text: "Downloading model", progress: 0.25 });
          callback({ text: "Finish loading", progress: 1 });
        }
        return engine;
      },
    },
  };
}

test("uses a WebLLM q4f32 model as the default instant browser chat runtime", () => {
  assert.equal(WEBLLM_DEFAULT_MODEL_ID, "Qwen2.5-0.5B-Instruct-q4f32_1-MLC");
  assert.match(WEBLLM_DEFAULT_MODEL_LABEL, /WebLLM/i);
});

test("loads WebLLM through CreateMLCEngine and reports download progress", async () => {
  resetWebLlmEngineForTests();
  const mock = createMockWebLlmRuntime();
  const progressMessages: string[] = [];

  const session = await loadWebLlmLocalModel({
    runtime: mock.runtime,
    onProgress(progress) {
      progressMessages.push(progress.message);
    },
  });

  assert.equal(session.kind, "webllm");
  assert.equal(session.modelId, WEBLLM_DEFAULT_MODEL_ID);
  assert.equal(mock.createCalls.length, 1);
  assert.equal(mock.createCalls[0]?.modelId, WEBLLM_DEFAULT_MODEL_ID);
  assert.equal(progressMessages.some((message) => /Downloading model/i.test(message)), true);
});

test("generates a normal chat answer with the loaded WebLLM engine", async () => {
  resetWebLlmEngineForTests();
  const mock = createMockWebLlmRuntime();
  const session = await loadWebLlmLocalModel({ runtime: mock.runtime });

  const result = await generateWebLlmAnswer("안녕", {
    engine: session,
    maxNewTokens: 64,
  });

  assert.equal(result.modelId, WEBLLM_DEFAULT_MODEL_ID);
  assert.match(result.text, /안녕|브라우저|로컬/);
  assert.equal(mock.completionCalls.length, 1);
  const messages = mock.completionCalls[0]?.messages as WebLlmChatMessage[];
  assert.equal(messages.at(-1)?.content, "안녕");
  assert.equal(mock.completionCalls[0]?.max_tokens, 64);
});

test("turns WebGPU adapter failures into a short actionable install error", async () => {
  resetWebLlmEngineForTests();

  await assert.rejects(
    () => loadWebLlmLocalModel({
      runtime: {
        async CreateMLCEngine() {
          throw new Error("Unable to find a compatible GPU. No available adapters.");
        },
      },
    }),
    /WebGPU를 사용할 수 없어 WebLLM 모델을 시작하지 못했습니다/,
  );
});

test("extracts WebLLM OpenAI-compatible response text", () => {
  assert.equal(
    extractWebLlmAnswerText({ choices: [{ message: { content: "  Local answer  " } }] }),
    "Local answer",
  );
  assert.equal(extractWebLlmAnswerText({ choices: [{ text: " completion answer " }] }), "completion answer");
});
