import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNNABLE_LOCAL_MODEL_ID,
  WEBLLM_DEFAULT_MODEL_ID,
  chooseBrowserLocalRuntime,
  isPhoneLikeOs,
} from "../../lib/local-ai";

const baseSignals = {
  fileSystemAccess: true,
  webGPU: true,
  indexedDB: true,
  cpuCores: 8,
  memoryGB: 16,
  browserName: "Chrome",
  osHint: "macOS",
};

test("uses WebLLM when this desktop browser has a real WebGPU adapter", () => {
  const profile = chooseBrowserLocalRuntime(baseSignals, { webGpuAdapterAvailable: true });

  assert.equal(profile.status, "webllm-ready");
  assert.equal(profile.recommendedFamily, "webllm");
  assert.equal(profile.recommendedModelId, WEBLLM_DEFAULT_MODEL_ID);
  assert.match(profile.reason, /WebGPU adapter/);
});

test("falls back to mobile-safe SmolLM2 when WebGPU API exists but adapter is unavailable", () => {
  const profile = chooseBrowserLocalRuntime(baseSignals, { webGpuAdapterAvailable: false });

  assert.equal(profile.status, "fallback-ready");
  assert.equal(profile.recommendedFamily, "transformers");
  assert.equal(profile.recommendedModelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.match(profile.reason, /adapter/);
  assert.match(profile.reason, /CPU\/WASM/);
});

test("uses the mobile-safe CPU/WASM model on phones even when navigator.gpu exists", () => {
  const profile = chooseBrowserLocalRuntime(
    { ...baseSignals, osHint: "Android", browserName: "Chrome Android", fileSystemAccess: false },
    { webGpuAdapterAvailable: true },
  );

  assert.equal(profile.isPhoneLike, true);
  assert.equal(profile.recommendedFamily, "transformers");
  assert.equal(profile.recommendedModelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.match(profile.reason, /mobile/i);
});

test("blocks model download only when browser storage is unavailable", () => {
  const profile = chooseBrowserLocalRuntime(
    { ...baseSignals, indexedDB: false },
    { webGpuAdapterAvailable: true },
  );

  assert.equal(profile.status, "blocked");
  assert.equal(profile.recommendedFamily, "none");
  assert.match(profile.reason, /IndexedDB|storage/);
});

test("falls back when the WebGPU API is not exposed", () => {
  const profile = chooseBrowserLocalRuntime(
    { ...baseSignals, webGPU: false },
    { webGpuAdapterAvailable: null },
  );

  assert.equal(profile.status, "fallback-ready");
  assert.equal(profile.recommendedFamily, "transformers");
  assert.equal(profile.recommendedModelId, RUNNABLE_LOCAL_MODEL_ID);
  assert.match(profile.reason, /WebGPU is not exposed/);
});

test("reports a checking state while desktop WebGPU adapter probing is unresolved", () => {
  const profile = chooseBrowserLocalRuntime(baseSignals);

  assert.equal(profile.status, "checking");
  assert.equal(profile.recommendedFamily, "webllm");
  assert.equal(profile.webGpuAdapterAvailable, null);
});

test("does not trust an impossible adapter result when the WebGPU API is absent", () => {
  const profile = chooseBrowserLocalRuntime(
    { ...baseSignals, webGPU: false },
    { webGpuAdapterAvailable: true },
  );

  assert.equal(profile.status, "fallback-ready");
  assert.equal(profile.recommendedFamily, "transformers");
  assert.equal(profile.recommendedModelId, RUNNABLE_LOCAL_MODEL_ID);
});

test("recognizes phone OS hints case-insensitively", () => {
  assert.equal(isPhoneLikeOs("Android"), true);
  assert.equal(isPhoneLikeOs("android"), true);
  assert.equal(isPhoneLikeOs(" iOS "), true);
  assert.equal(isPhoneLikeOs("macOS"), false);
});
