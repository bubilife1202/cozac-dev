import type { CapabilitySignals, ModelRecommendation } from "./types";
import { recommendLocalModel } from "./diagnostics";

export type LocalModelEngineState = {
  recommendation: ModelRecommendation;
  cloudFallbackAvailable: false;
};

export function createLocalModelEngineState(signals: CapabilitySignals): LocalModelEngineState {
  return {
    recommendation: recommendLocalModel(signals),
    cloudFallbackAvailable: false,
  };
}

export async function rejectCloudModelFallback(): Promise<never> {
  throw new Error("Cloud LLM fallback is disabled for Local Agent v1; model execution must stay browser-local.");
}
