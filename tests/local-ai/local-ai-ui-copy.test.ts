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

test("checks each visitor device and exposes a mobile CPU fallback path", () => {
  assert.match(localAiAppSource, /Check this device/);
  assert.match(localAiAppSource, /requestAdapter/);
  assert.match(localAiAppSource, /Mobile fallback/);
  assert.match(localAiAppSource, /SmolLM2 135M/);
  assert.match(localAiAppSource, /CPU\/WASM/);
  assert.match(localAiAppSource, /resolveLocalModelEngine\(selectedModel\.family\)/);
});

test("exposes Gemma 4 E2B and E4B as explicit advanced browser-local model choices", () => {
  assert.match(localAiAppSource, /ADVANCED_BROWSER_LOCAL_MODELS/);
  assert.match(localAiAppSource, /Gemma 4 E2B/);
  assert.match(localAiAppSource, /Gemma 4 E4B/);
  assert.match(localAiAppSource, /Verified heavy local model/);
  assert.match(localAiAppSource, /Experimental \/ unverified/);
  assert.match(localAiAppSource, /Advanced local models/);
});

test("keeps heavy Gemma choices guarded on phone-like fallback devices", () => {
  assert.match(localAiAppSource, /heavyModelSelectionDisabled/);
  assert.match(localAiAppSource, /Gemma heavy models are disabled on phone-like fallback devices/);
  assert.match(localAiAppSource, /Use SmolLM2 135M CPU\/WASM fallback on mobile/);
});

test("routes explicit Transformers model IDs instead of collapsing every Transformers choice to SmolLM2", () => {
  assert.match(localAiAppSource, /getTransformersBrowserModel\(modelIdOverride/);
  assert.doesNotMatch(localAiAppSource, /familyOverride === "transformers"\s*\?\s*mobileFallbackModel/);
  assert.match(localAiAppSource, /loadedModelFamilyRef\.current === selectedModel\.family/);
});
