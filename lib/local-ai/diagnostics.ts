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
      label: "Gemma 3 270M local smoke model",
      reasons: ["WebGPU is unavailable; use the runnable 270M ONNX model on WASM before recommending larger future models."],
    };
  }

  if (cpuCores >= 8 && memoryGB >= 12) {
    reasons.push("WebGPU is available with enough CPU and memory signal to consider 2B/4B future upgrades after the 270M smoke model works.");
  } else if (cpuCores >= 4 && memoryGB >= 6) {
    reasons.push("WebGPU is available; keep 2B as a future recommendation and run 270M first.");
  } else {
    reasons.push("Device CPU or memory signal is low or unavailable; run the 270M smoke model before any larger recommendation.");
  }

  return {
    tier: "gemma-3-270m-it",
    status: "ready",
    label: "Gemma 3 270M local smoke model",
    reasons,
  };
}
