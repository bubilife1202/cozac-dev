export type BrowserRunnableModelTier = "mobile-135m" | "e2b" | "e4b";

export type LocalAiRecommendationTier =
  | "smollm2-135m-instruct"
  | "gemma-4-e2b"
  | "gemma-4-e4b"
  | "unsupported"
  | string;

export type ModelInstallCopy = {
  status: string;
  headline: string;
  detail: string;
  nextAction: string;
};

export function getBrowserInstallTier(recommendationTier: LocalAiRecommendationTier): BrowserRunnableModelTier {
  if (recommendationTier === "smollm2-135m-instruct") return "mobile-135m";
  if (recommendationTier === "gemma-4-e2b") return "mobile-135m";
  if (recommendationTier === "gemma-4-e4b") return "mobile-135m";
  return "mobile-135m";
}

export function getModelInstallCopy({
  selectedTier,
  installTier,
}: {
  selectedTier: BrowserRunnableModelTier | "26b-a4b" | "31b";
  installTier: BrowserRunnableModelTier | "26b-a4b" | "31b";
}): ModelInstallCopy {
  if (selectedTier === "e4b" && installTier === "mobile-135m") {
    return {
      status: "E4B candidate · quick chat first",
      headline: "바로 대답은 WebLLM fast model로 시작합니다.",
      detail: "E4B는 이 PC에서 시도할 만한 후보지만 브라우저 첫 대화에 자동 설치하지 않습니다. 먼저 WebLLM Qwen2.5 0.5B q4f32 모델로 즉시 응답을 확인하고, E2B/E4B는 별도 고급 설치로 다룹니다.",
      nextAction: "Install WebLLM fast model",
    };
  }

  if (selectedTier === "e4b" && installTier === "e2b") {
    return {
      status: "E4B candidate · E2B first install",
      headline: "이 PC는 E4B 후보지만, 브라우저 첫 설치는 검증된 E2B로 시작합니다.",
      detail: "E4B는 이 PC에서 시도할 만한 후보입니다. 다만 현재 브라우저 로컬 경로에서 실제 proof가 끝난 안정 시작점은 Gemma 4 E2B입니다. E2B 설치/응답을 먼저 확인한 뒤 E4B를 시도하는 순서가 맞습니다.",
      nextAction: "Install Gemma 4 E2B",
    };
  }

  if (selectedTier === "e2b") {
    return {
      status: "E2B quality candidate · quick chat first",
      headline: "Gemma 4 E2B는 품질 후보이고, 첫 클릭 설치는 WebLLM으로 갑니다.",
      detail: "E2B는 브라우저/드라이버 상태에 따라 fp16/WebGPU에서 막힐 수 있습니다. 그래서 '안녕' 같은 즉시 응답 확인은 WebLLM Qwen2.5 0.5B q4f32로 시작하고, Gemma 4는 별도 고급 설치/검증으로 분리합니다.",
      nextAction: "Install WebLLM fast model",
    };
  }

  if (selectedTier === "mobile-135m") {
    return {
      status: "WebLLM fast browser runtime",
      headline: "WebLLM Qwen2.5 0.5B를 받아서 바로 대화합니다.",
      detail: "WebLLM의 q4f32 사전 빌드 모델을 브라우저 캐시에 받고, Ready 이후 이 탭 안에서 바로 로컬 응답을 생성합니다. fp16이 막힌 브라우저에서도 첫 응답 경로가 무거운 Gemma로 빠지지 않습니다.",
      nextAction: "Install WebLLM fast model",
    };
  }

  return {
    status: "Native runtime recommended",
    headline: "이 모델은 브라우저 설치보다 네이티브 런타임이 맞습니다.",
    detail: "26B/31B급은 브라우저 탭보다 Ollama류 네이티브 런타임이나 서버/워크스테이션 경로가 맞습니다.",
    nextAction: "Choose E2B instead",
  };
}
