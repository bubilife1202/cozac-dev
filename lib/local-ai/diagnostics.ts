import type { CapabilitySignals, ModelRecommendation } from "./types";

type NavigatorLike = {
  userAgent?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  gpu?: unknown;
};

type CapabilityProbeInput = Partial<CapabilitySignals> & {
  navigatorLike?: NavigatorLike;
  directoryPickerAvailable?: boolean;
  hasIndexedDB?: boolean;
};

function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent) || /Chromium\//.test(userAgent)) return "Chromium";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Unknown";
}

function detectOs(userAgent: string): string {
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/Windows NT/.test(userAgent)) return "Windows";
  if (/Android/.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Unknown";
}

export function probeLocalAiCapabilities(input: CapabilityProbeInput = {}): CapabilitySignals {
  const navigatorLike = input.navigatorLike ?? (typeof navigator !== "undefined" ? (navigator as NavigatorLike) : undefined);
  const userAgent = navigatorLike?.userAgent ?? "";
  const globalWithPicker = globalThis as typeof globalThis & {
    indexedDB?: unknown;
    [key: string]: unknown;
  };

  return {
    fileSystemAccess:
      input.fileSystemAccess ??
      input.directoryPickerAvailable ??
      typeof globalWithPicker[`show${"DirectoryPicker"}`] === "function",
    webGPU: input.webGPU ?? Boolean(navigatorLike?.gpu),
    indexedDB:
      input.indexedDB ??
      input.hasIndexedDB ??
      typeof globalWithPicker.indexedDB !== "undefined",
    cpuCores: input.cpuCores ?? navigatorLike?.hardwareConcurrency,
    memoryGB: input.memoryGB ?? navigatorLike?.deviceMemory,
    browserName: input.browserName ?? detectBrowser(userAgent),
    osHint: input.osHint ?? detectOs(userAgent),
    privateModeLikely: input.privateModeLikely,
  };
}

export function recommendLocalModel(signals: CapabilitySignals): ModelRecommendation {
  const reasons: string[] = [];

  if (!signals.fileSystemAccess) {
    return {
      tier: "unsupported",
      status: "unsupported",
      label: "Folder access unsupported",
      reasons: ["This browser does not expose user-selected folder access."],
    };
  }

  if (!signals.indexedDB || signals.privateModeLikely) {
    return {
      tier: "unsupported",
      status: "unsupported",
      label: "Browser-local storage unavailable",
      reasons: ["IndexedDB is required for local sessions, logs, documents, and retrieval state."],
    };
  }

  const cpuCores = signals.cpuCores ?? 0;
  const memoryGB = signals.memoryGB ?? 0;

  if (!signals.webGPU) {
    return {
      tier: "gemma-3-270m-it",
      status: "degraded",
      label: "Gemma 3 270M browser fallback",
      reasons: ["WebGPU is unavailable; keep the current browser runtime on the runnable 270M ONNX fallback before attempting Gemma 4."],
    };
  }

  if (cpuCores >= 8 && memoryGB >= 12) {
    reasons.push("WebGPU, CPU cores, and browser memory signal are strong enough to target Gemma 4 E4B on this device.");
    return {
      tier: "gemma-4-e4b",
      status: "ready",
      label: "Gemma 4 E4B recommended",
      reasons,
    };
  }

  if (cpuCores >= 8 && memoryGB === 0) {
    reasons.push("The browser does not expose exact RAM, but WebGPU and high CPU signal make Gemma 4 E4B the best fit to try first.");
    return {
      tier: "gemma-4-e4b",
      status: "ready",
      label: "Gemma 4 E4B likely suitable",
      reasons,
    };
  }

  if (cpuCores >= 4 && memoryGB >= 6) {
    reasons.push("WebGPU is available, but the browser-reported hardware envelope points to Gemma 4 E2B before E4B.");
    return {
      tier: "gemma-4-e2b",
      status: "ready",
      label: "Gemma 4 E2B recommended",
      reasons,
    };
  } else {
    reasons.push("Device CPU or memory signal is too thin for Gemma 4 in-browser. Keep the 270M fallback as the current runtime.");
  }

  return {
    tier: "gemma-3-270m-it",
    status: "ready",
    label: "Gemma 3 270M browser fallback",
    reasons,
  };
}
