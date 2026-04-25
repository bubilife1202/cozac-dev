import assert from "node:assert/strict";
import test from "node:test";

import { getBrowserInstallTier, getModelInstallCopy } from "../../lib/local-ai/model-selection";

test("uses Gemma 4 E2B as the safe browser install default when hardware can try E4B", () => {
  assert.equal(getBrowserInstallTier("gemma-4-e4b"), "e2b");
});

test("keeps the phone-safe mobile runtime as the browser install default on fallback devices", () => {
  assert.equal(getBrowserInstallTier("smollm2-135m-instruct"), "mobile-135m");
});

test("explains that E4B is a capable-device candidate, not the first browser install", () => {
  const copy = getModelInstallCopy({ selectedTier: "e4b", installTier: "e2b" });

  assert.match(copy.status, /candidate/i);
  assert.match(copy.nextAction, /Install Gemma 4 E2B/i);
  assert.match(copy.detail, /E4B/);
  assert.match(copy.detail, /E2B/);
});

test("keeps selected Mobile local install copy even on E2B-capable devices", () => {
  const copy = getModelInstallCopy({ selectedTier: "mobile-135m", installTier: "e2b" });

  assert.match(copy.nextAction, /Install Mobile local 135M/i);
  assert.match(copy.detail, /로컬/);
});

test("keeps selected E2B install copy even on mobile fallback devices", () => {
  const copy = getModelInstallCopy({ selectedTier: "e2b", installTier: "mobile-135m" });

  assert.match(copy.nextAction, /Install Gemma 4 E2B/i);
  assert.match(copy.status, /Recommended browser install/i);
});
