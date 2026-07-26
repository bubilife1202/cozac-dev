export type PortfolioKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  url: string;
  keywords: readonly string[];
};

export type RetrievedPortfolioKnowledge = PortfolioKnowledgeEntry & {
  score: number;
};

export const PORTFOLIO_KNOWLEDGE: readonly PortfolioKnowledgeEntry[] = [
  {
    id: "profile",
    title: "cozac 소개",
    content:
      "Jinbae Park(cozac)은 Embedded, AI, Web을 연결해 제품을 만드는 소프트웨어 엔지니어이며 cozac.dev를 운영한다. 연락은 Lobby의 비공개 메시지로 남길 수 있다.",
    url: "/notes/about-me",
    keywords: ["cozac", "jinbae", "박진배", "소개", "누구", "직무", "소프트웨어 엔지니어", "연락", "협업"],
  },
  {
    id: "hanwha-defense",
    title: "한화 방산 임베디드 경험",
    content:
      "한화(현 한화에어로스페이스)에서 회로 설계, PCB 제작, 펌웨어 개발, 완제품 조립과 시험, MIL-STD 인증까지 하드웨어·소프트웨어 풀사이클을 수행했다. 소프트웨어 신뢰성시험, 환경안전 관리, 사업 수주 제안서 작성도 경험했다.",
    url: "/notes/experience",
    keywords: ["한화", "한화에어로스페이스", "방산", "임베디드", "embedded", "회로", "pcb", "펌웨어", "firmware", "mil-std", "신뢰성시험"],
  },
  {
    id: "hanwha-system-edge-ai",
    title: "한화시스템 Edge AI 경험",
    content:
      "한화시스템에서 AI 논문·기술 조사, 데이터셋 구축, 자율 무인 수상정 연구, EO 기반 TensorFlow 자율주행 PoC를 수행했다. 사내벤처에서는 Jetson Edge 디바이스에서 다중 카메라 실시간 영상 감지 AI를 개발했고 해양·우주·위성 사업 수주와 AI 기술 세미나에도 참여했다.",
    url: "/notes/experience",
    keywords: ["한화시스템", "ai", "인공지능", "tensorflow", "jetson", "edge ai", "엣지 ai", "다중 카메라", "영상 감지", "자율주행", "무인 수상정", "위성", "사내벤처"],
  },
  {
    id: "ainex-medical-ai",
    title: "아이넥스 의료기기 경험",
    content:
      "아이넥스코퍼레이션에서 대장·위내시경 제품개발 관리, 국책과제 사업 수주, 고객지원, RA 인허가 지원을 수행했다. SIDDS 2024에서 내시경 AI 효과성 검증과 관련한 학회 발표 경험이 있다.",
    url: "/notes/experience",
    keywords: ["아이넥스", "의료기기", "내시경", "대장", "위내시경", "ra", "인허가", "국책과제", "sidds", "학회", "고객지원"],
  },
  {
    id: "solace-project",
    title: "Solace 프로젝트",
    content:
      "Solace는 AI 페르소나들과 소통하며 위로받는 1인 감성 SNS다. Build with TRAE @Seoul 해커톤 최우수상(ByteDance, 2026.01)을 받았으며 dearsolace.kr에서 확인할 수 있다.",
    url: "/notes/projects",
    keywords: ["solace", "dearsolace", "감성 sns", "ai 페르소나", "해커톤", "bytedance", "trae", "최우수상"],
  },
  {
    id: "cozac-dev-project",
    title: "cozac.dev 프로젝트",
    content:
      "cozac.dev는 macOS와 iOS에서 영감을 받은 인터랙티브 포트폴리오다. Next.js, TypeScript, Supabase, Tailwind CSS로 윈도우 매니저, Dock, Notes, Finder, Messages, Lobby 등의 앱 경험을 웹에 구현했다.",
    url: "/notes/projects",
    keywords: ["cozac.dev", "포트폴리오", "macos", "ios", "next.js", "typescript", "supabase", "tailwind", "윈도우 매니저", "dock", "messages", "lobby"],
  },
] as const;

const GENERIC_QUERY_TOKEN = /^(경험|경험은|경력|경력은|프로젝트|프로젝트는|관련|내용|정보|알려줘|알려주세요|궁금해|있어|있나요|했어|해봤어|무엇|뭐야|어떻게)$/;
const PERSONAL_FACT_PATTERN = /(해본\s*적|해봤|경험|경력|알바|근무|일한\s*적|학력|학교|전공|나이|취미|좋아해|싫어해|가족|결혼)/i;
const GENERAL_CAREER_PATTERN = /(경력|커리어|회사|직장|무슨\s*일|어떤\s*일|일했|업무)/i;
const GENERAL_PROJECT_PATTERN = /(프로젝트|만든\s*것|만든\s*거|작업물|포트폴리오)/i;
const GENERAL_PROFILE_PATTERN = /(누구|소개|정체|본인|cozac|jinbae|박진배)/i;
const LEGACY_PORTFOLIO_MESSAGE_PREFIXES = [
  "지금은 챗봇이 비활성화되어 있어요",
  "Gemma 4가 아직 준비되지 않았어요",
] as const;

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      normalize(query)
        .match(/[\p{L}\p{N}+#.]+/gu)
        ?.filter((token) => token.length > 1 && !GENERIC_QUERY_TOKEN.test(token)) ?? [],
    ),
  );
}

export function retrievePortfolioKnowledge(
  query: string,
  limit = 3,
): RetrievedPortfolioKnowledge[] {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    const genericIds = GENERAL_CAREER_PATTERN.test(query)
      ? ["hanwha-system-edge-ai", "hanwha-defense", "ainex-medical-ai"]
      : GENERAL_PROJECT_PATTERN.test(query)
        ? ["solace-project", "cozac-dev-project"]
        : GENERAL_PROFILE_PATTERN.test(query)
          ? ["profile"]
          : [];

    return genericIds
      .map((id, index) => {
        const entry = PORTFOLIO_KNOWLEDGE.find((item) => item.id === id);
        return entry ? { ...entry, score: genericIds.length - index } : null;
      })
      .filter((entry): entry is RetrievedPortfolioKnowledge => entry !== null)
      .slice(0, Math.max(0, limit));
  }

  return PORTFOLIO_KNOWLEDGE.map((entry) => {
    const normalizedKeywords = entry.keywords.map(normalize);
    const haystack = normalize(`${entry.title} ${entry.content} ${normalizedKeywords.join(" ")}`);
    let score = 0;

    for (const keyword of normalizedKeywords) {
      if (normalizedQuery.includes(keyword)) score += keyword.includes(" ") ? 8 : 5;
    }
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length >= 5 ? 3 : 1;
    }

    return { ...entry, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));
}

export function formatPortfolioGrounding(query: string): string {
  const sources = retrievePortfolioKnowledge(query);
  if (sources.length === 0) {
    return [
      "[공개 포트폴리오 근거]",
      "공개 포트폴리오에서 확인된 관련 근거가 없습니다.",
      "개인 경력이나 경험을 추측하지 말고, 공개 자료에서 확인되지 않는다고 답하세요.",
    ].join("\n");
  }

  return [
    "[공개 포트폴리오 근거]",
    ...sources.map(
      (source) => `- ${source.title} (${source.url})\n  ${source.content}`,
    ),
    "위 근거 안에서만 개인 경력과 프로젝트 사실을 답하고, 근거에 없는 내용은 추측하지 마세요.",
  ].join("\n");
}

export function shouldDeclineUngroundedPersonalQuestion(query: string): boolean {
  return PERSONAL_FACT_PATTERN.test(query) && retrievePortfolioKnowledge(query).length === 0;
}

const DEFLECTION_PATTERN =
  /(질문.*명확|무슨\s*뜻|정보.*부족|알\s*수\s*없|잘\s*모르|다시\s*질문|clarify|not enough information)/i;

/**
 * Decide whether to serve the model's answer or the grounding text itself.
 *
 * Only two things disqualify a model answer: it is empty, or it deflects
 * ("could you clarify?") even though we handed it the evidence. Anything else
 * is served as written - the model paraphrasing the grounding in its own words
 * is the desired behaviour, not a failure, and the earlier keyword check threw
 * those answers away in favour of a verbatim knowledge-base sentence.
 */
export function resolveGroundedPortfolioAnswer(
  query: string,
  modelAnswer: string,
): string {
  const answer = modelAnswer.replace(/\s+/g, " ").trim();
  const sources = retrievePortfolioKnowledge(query);
  if (sources.length === 0) return answer;

  if (!answer || DEFLECTION_PATTERN.test(answer)) {
    return sources[0].content;
  }

  return answer;
}

export function isLegacyPortfolioMessage(content: string): boolean {
  const normalizedContent = content.trim();
  return LEGACY_PORTFOLIO_MESSAGE_PREFIXES.some((prefix) =>
    normalizedContent.startsWith(prefix),
  );
}
