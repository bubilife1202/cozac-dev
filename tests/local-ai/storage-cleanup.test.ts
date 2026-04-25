import assert from "node:assert/strict";
import test from "node:test";

import { getLocalAiCacheDeletionPlan } from "../../lib/local-ai/storage";

test("targets Local Agent model/cache names for deletion without wiping unrelated site caches", () => {
  const plan = getLocalAiCacheDeletionPlan([
    "transformers-cache",
    "onnx-community-gemma-4-E2B-it-ONNX",
    "cozac-local-ai-models",
    "next-static-assets",
    "photos-cache",
  ]);

  assert.deepEqual(plan, ["transformers-cache", "onnx-community-gemma-4-E2B-it-ONNX", "cozac-local-ai-models"]);
});
