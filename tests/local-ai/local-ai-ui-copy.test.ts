import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const localAiAppSource = readFileSync(
  join(process.cwd(), "components/apps/local-ai/local-ai-app.tsx"),
  "utf8",
);

test("renders a visible WebLLM model catalog instead of a single hidden default", () => {
  assert.match(localAiAppSource, /WEBLLM_BROWSER_MODELS/);
  assert.match(localAiAppSource, /map\(\(model\)/);
  assert.match(localAiAppSource, /Select browser model/);
  assert.match(localAiAppSource, /Qwen2\.5 0\.5B/);
  assert.match(localAiAppSource, /SmolLM2 360M/);
  assert.match(localAiAppSource, /Llama 3\.2 1B/);
  assert.match(localAiAppSource, /Qwen2\.5 1\.5B/);
  assert.doesNotMatch(localAiAppSource, /MODEL_TIERS\.filter\(\(tier\) => tier\.id !== "mobile-135m"\)\.map/);
});

test("keeps the chat-first flow explicit in the Local LLM surface", () => {
  assert.match(localAiAppSource, /Download selected model/);
  assert.match(localAiAppSource, /Clear downloaded model/);
  assert.match(localAiAppSource, /Ask anything local/);
  assert.match(localAiAppSource, /Enter 전송/);
  assert.match(localAiAppSource, /cloud fallback 없음/);
});
