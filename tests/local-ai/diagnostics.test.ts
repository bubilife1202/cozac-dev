import assert from "node:assert/strict";
import test from "node:test";

import { probeLocalAiCapabilities, recommendLocalModel } from "../../lib/local-ai/diagnostics";

test("reports unsupported state when folder access is unavailable", () => {
  const signals = probeLocalAiCapabilities({
    directoryPickerAvailable: false,
    hasIndexedDB: true,
    webGPU: true,
    navigatorLike: { userAgent: "Firefox/124", hardwareConcurrency: 8, deviceMemory: 16 },
  });
  const recommendation = recommendLocalModel(signals);

  assert.equal(signals.fileSystemAccess, false);
  assert.equal(signals.browserName, "Firefox");
  assert.equal(recommendation.status, "unsupported");
  assert.equal(recommendation.tier, "unsupported");
});

test("recommends degraded 270M smoke mode when WebGPU is missing", () => {
  const recommendation = recommendLocalModel({
    fileSystemAccess: true,
    webGPU: false,
    indexedDB: true,
    cpuCores: 8,
    memoryGB: 16,
    browserName: "Chromium",
    osHint: "macOS",
  });

  assert.equal(recommendation.status, "degraded");
  assert.equal(recommendation.tier, "gemma-3-270m-it");
});

test("keeps high capability WebGPU devices on the runnable 270M smoke model first", () => {
  const recommendation = recommendLocalModel({
    fileSystemAccess: true,
    webGPU: true,
    indexedDB: true,
    cpuCores: 10,
    memoryGB: 16,
    browserName: "Chromium",
    osHint: "macOS",
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.tier, "gemma-3-270m-it");
});

test("keeps midrange devices on the runnable 270M smoke model first", () => {
  const recommendation = recommendLocalModel({
    fileSystemAccess: true,
    webGPU: true,
    indexedDB: true,
    cpuCores: 4,
    memoryGB: 8,
    browserName: "Edge",
    osHint: "Windows",
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.tier, "gemma-3-270m-it");
});
