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
  if (recommendationTier === "gemma-4-e2b") return "e2b";
  if (recommendationTier === "gemma-4-e4b") return "e2b";
  return "mobile-135m";
}

export function getModelInstallCopy({
  selectedTier,
  installTier,
}: {
  selectedTier: BrowserRunnableModelTier | "26b-a4b" | "31b";
  installTier: BrowserRunnableModelTier | "26b-a4b" | "31b";
}): ModelInstallCopy {
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
      status: "Recommended browser install",
      headline: "Gemma 4 E2B를 이 브라우저에 설치해서 바로 대화합니다.",
      detail: "모델 파일은 브라우저 캐시에 내려받고, 대화는 이 탭 안에서 로컬로 생성합니다. 파일 읽기/쓰기만 별도 폴더 선택이 필요합니다.",
      nextAction: "Install Gemma 4 E2B",
    };
  }

  if (selectedTier === "mobile-135m") {
    return {
      status: "Fastest local smoke runtime",
      headline: "Mobile local 135M을 설치해서 가장 빠르게 로컬 응답을 확인합니다.",
      detail: "품질은 낮지만 휴대폰/브라우저 캐시 한계에서도 실제 로컬 로드와 응답을 확인하기 가장 안전합니다.",
      nextAction: "Install Mobile local 135M",
    };
  }

  return {
    status: "Native runtime recommended",
    headline: "이 모델은 브라우저 설치보다 네이티브 런타임이 맞습니다.",
    detail: "26B/31B급은 브라우저 탭보다 Ollama류 네이티브 런타임이나 서버/워크스테이션 경로가 맞습니다.",
    nextAction: "Choose E2B instead",
  };
}
