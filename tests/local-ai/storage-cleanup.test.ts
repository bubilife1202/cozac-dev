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

test("deletes only browser model caches while preserving Local Agent IndexedDB", async () => {
  const storage = (await import("../../lib/local-ai/storage")) as typeof import("../../lib/local-ai/storage") & {
    clearLocalAiModelCaches?: (cacheStorage: {
      keys(): Promise<string[]>;
      delete(cacheName: string): Promise<boolean>;
    }) => Promise<{ deletedCaches: string[]; errors: string[] }>;
  };

  assert.equal(typeof storage.clearLocalAiModelCaches, "function");

  const deleted: string[] = [];
  const result = await storage.clearLocalAiModelCaches!({
    async keys() {
      return [
        "transformers-cache",
        "onnx-community-gemma-4-E2B-it-ONNX",
        "next-static-assets",
        "photos-cache",
      ];
    },
    async delete(cacheName) {
      deleted.push(cacheName);
      return true;
    },
  });

  assert.deepEqual(deleted, ["transformers-cache", "onnx-community-gemma-4-E2B-it-ONNX"]);
  assert.deepEqual(result, {
    deletedCaches: ["transformers-cache", "onnx-community-gemma-4-E2B-it-ONNX"],
    errors: [],
  });
});
