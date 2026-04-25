import assert from "node:assert/strict";
import test from "node:test";

import { getBrowserInstallTier, getModelInstallCopy } from "../../lib/local-ai/model-selection";

test("uses the fast Mobile local runtime as the default chat install even when hardware can try E4B", () => {
  assert.equal(getBrowserInstallTier("gemma-4-e4b"), "mobile-135m");
});

test("keeps the phone-safe mobile runtime as the browser install default on fallback devices", () => {
  assert.equal(getBrowserInstallTier("smollm2-135m-instruct"), "mobile-135m");
});

test("explains that E4B is a capable-device candidate, not the immediate chat install", () => {
  const copy = getModelInstallCopy({ selectedTier: "e4b", installTier: "mobile-135m" });

  assert.match(copy.status, /candidate/i);
  assert.match(copy.nextAction, /Install WebLLM fast model/i);
  assert.match(copy.detail, /E4B/);
  assert.match(copy.detail, /WebLLM/);
});

test("keeps selected WebLLM install copy even on E2B-capable devices", () => {
  const copy = getModelInstallCopy({ selectedTier: "mobile-135m", installTier: "e2b" });

  assert.match(copy.nextAction, /Install WebLLM fast model/i);
  assert.match(copy.detail, /WebLLM/);
});

test("does not offer E2B as the first-click install when the user selects a heavy candidate", () => {
  const copy = getModelInstallCopy({ selectedTier: "e2b", installTier: "mobile-135m" });

  assert.match(copy.nextAction, /Install WebLLM fast model/i);
  assert.match(copy.status, /quality candidate/i);
  assert.match(copy.detail, /별도 고급 설치/);
});

test("keeps the first-run copy simple like a local LLM download-and-chat page", () => {
  const copy = getModelInstallCopy({ selectedTier: "mobile-135m", installTier: "mobile-135m" });

  assert.equal(copy.nextAction, "Install WebLLM fast model");
  assert.match(copy.headline, /WebLLM Qwen2\.5 0\.5B/);
  assert.match(copy.detail, /브라우저 캐시/);
  assert.doesNotMatch(`${copy.status} ${copy.headline} ${copy.detail} ${copy.nextAction}`, /Mobile local 135M|phone-safe/i);
});
