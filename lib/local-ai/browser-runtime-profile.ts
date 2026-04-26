import { RUNNABLE_LOCAL_MODEL_ID, RUNNABLE_LOCAL_MODEL_LABEL } from "./model-engine";
import type { CapabilitySignals } from "./types";
import { WEBLLM_DEFAULT_MODEL_ID, WEBLLM_DEFAULT_MODEL_LABEL } from "./webllm-engine";

export type BrowserLocalRuntimeFamily = "webllm" | "transformers" | "none";
export type BrowserLocalRuntimeStatus = "checking" | "webllm-ready" | "fallback-ready" | "blocked";

export type BrowserLocalRuntimeProfile = {
  status: BrowserLocalRuntimeStatus;
  recommendedFamily: BrowserLocalRuntimeFamily;
  recommendedModelId: string | null;
  recommendedLabel: string;
  reason: string;
  isPhoneLike: boolean;
  webGpuApiAvailable: boolean;
  webGpuAdapterAvailable: boolean | null;
};

export function isPhoneLikeOs(osHint: string): boolean {
  const normalizedOs = osHint.trim().toLowerCase();
  return normalizedOs === "ios" || normalizedOs === "android";
}

export function chooseBrowserLocalRuntime(
  signals: CapabilitySignals,
  options: { webGpuAdapterAvailable?: boolean | null } = {},
): BrowserLocalRuntimeProfile {
  const isPhoneLike = isPhoneLikeOs(signals.osHint);
  const webGpuAdapterAvailable = options.webGpuAdapterAvailable ?? null;

  if (!signals.indexedDB) {
    return {
      status: "blocked",
      recommendedFamily: "none",
      recommendedModelId: null,
      recommendedLabel: "Browser storage unavailable",
      reason: "IndexedDB/browser storage is required to keep local model files and sessions on this device.",
      isPhoneLike,
      webGpuApiAvailable: signals.webGPU,
      webGpuAdapterAvailable,
    };
  }

  if (isPhoneLike) {
    return {
      status: "fallback-ready",
      recommendedFamily: "transformers",
      recommendedModelId: RUNNABLE_LOCAL_MODEL_ID,
      recommendedLabel: `Mobile fallback — ${RUNNABLE_LOCAL_MODEL_LABEL}`,
      reason:
        `Mobile browsers have tighter memory/cache limits and WebGPU adapter availability is inconsistent, so use the ${RUNNABLE_LOCAL_MODEL_LABEL} CPU/WASM fallback first.`,
      isPhoneLike,
      webGpuApiAvailable: signals.webGPU,
      webGpuAdapterAvailable,
    };
  }

  if (webGpuAdapterAvailable === true && signals.webGPU) {
    return {
      status: "webllm-ready",
      recommendedFamily: "webllm",
      recommendedModelId: WEBLLM_DEFAULT_MODEL_ID,
      recommendedLabel: WEBLLM_DEFAULT_MODEL_LABEL,
      reason: "This browser exposed a real WebGPU adapter, so WebLLM models can be downloaded and run in this tab.",
      isPhoneLike,
      webGpuApiAvailable: signals.webGPU,
      webGpuAdapterAvailable,
    };
  }

  if (webGpuAdapterAvailable === false || !signals.webGPU) {
    return {
      status: "fallback-ready",
      recommendedFamily: "transformers",
      recommendedModelId: RUNNABLE_LOCAL_MODEL_ID,
      recommendedLabel: `Fallback — ${RUNNABLE_LOCAL_MODEL_LABEL}`,
      reason:
        signals.webGPU
          ? `navigator.gpu exists, but this browser could not create a WebGPU adapter; use the ${RUNNABLE_LOCAL_MODEL_LABEL} CPU/WASM fallback instead.`
          : `WebGPU is not exposed in this browser; use the ${RUNNABLE_LOCAL_MODEL_LABEL} CPU/WASM fallback instead.`,
      isPhoneLike,
      webGpuApiAvailable: signals.webGPU,
      webGpuAdapterAvailable,
    };
  }

  return {
    status: "checking",
    recommendedFamily: "webllm",
    recommendedModelId: WEBLLM_DEFAULT_MODEL_ID,
    recommendedLabel: WEBLLM_DEFAULT_MODEL_LABEL,
    reason: "Checking this device for a real WebGPU adapter before choosing the best local runtime.",
    isPhoneLike,
    webGpuApiAvailable: signals.webGPU,
    webGpuAdapterAvailable,
  };
}
