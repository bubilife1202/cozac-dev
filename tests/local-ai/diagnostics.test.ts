import assert from "node:assert/strict";
import test from "node:test";

import { probeLocalAiCapabilities, recommendLocalModel } from "../../lib/local-ai/diagnostics";

test("recommends browser-local chat on phones even when folder access is unavailable", () => {
  const signals = probeLocalAiCapabilities({
    directoryPickerAvailable: false,
    hasIndexedDB: true,
    webGPU: true,
    navigatorLike: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      hardwareConcurrency: 6,
      deviceMemory: 8,
    },
  });
  const recommendation = recommendLocalModel(signals);

  assert.equal(signals.fileSystemAccess, false);
  assert.equal(signals.browserName, "Safari");
  assert.equal(signals.osHint, "iOS");
  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.tier, "gemma-3-270m-it");
  assert.match(recommendation.reasons.join(" "), /phone-safe local runtime/i);
  assert.match(recommendation.reasons.join(" "), /folder-free local chat/i);
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

test("recommends Gemma 4 E4B for high capability WebGPU devices", () => {
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
  assert.equal(recommendation.tier, "gemma-4-e4b");
});

test("recommends Gemma 4 E2B for midrange WebGPU devices", () => {
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
  assert.equal(recommendation.tier, "gemma-4-e2b");
});
