import {
  formatPortfolioGrounding,
  resolveGroundedPortfolioAnswer,
  retrievePortfolioKnowledge,
  shouldDeclineUngroundedPersonalQuestion,
} from "./portfolio-knowledge";
import {
  generateHostedGemma4,
  streamHostedGemma4,
  HOSTED_GEMMA_MODEL_ID,
  type HostedGemmaMessage,
} from "./hosted-gemma";

export type HostedPortfolioChatResult = {
  answer: string;
  sources: string[];
  provider: "google" | "portfolio-guard" | "grounded-fallback";
  model: typeof HOSTED_GEMMA_MODEL_ID;
};

type AnswerHostedPortfolioChatOptions = {
  apiKey: string;
  messages: HostedGemmaMessage[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

function normalizeConversation(messages: HostedGemmaMessage[]): HostedGemmaMessage[] {
  const cleaned = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2_000),
    }));
  const firstUserIndex = cleaned.findIndex((message) => message.role === "user");
  if (firstUserIndex < 0) return [];

  const normalized: HostedGemmaMessage[] = [];
  for (const message of cleaned.slice(firstUserIndex)) {
    const previous = normalized.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n${message.content}`.slice(-2_000);
    } else {
      normalized.push({ ...message });
    }
  }
  return normalized;
}

function declineUnsupportedClaim(query: string): string {
  return /[가-힣]/.test(query)
    ? "그 내용은 공개 포트폴리오에서 확인되지 않아요. 확인된 경력이나 프로젝트에 대해서는 정확히 답해드릴게요."
    : "That is not confirmed in the public portfolio. I can answer accurately about the listed experience and projects.";
}

const SYSTEM_PROMPT_HEADER = [
  "You are the public portfolio guide for Jinbae Park, also known as cozac.",
  "Reply in the user's language, naturally and briefly like iMessage (1-3 sentences).",
  "For personal history, work, credentials, and projects, use only the verified public portfolio evidence below.",
  "Never invent or infer a personal fact. If the evidence does not contain it, say it is not confirmed in the public portfolio.",
  "You cannot see private notes, local files, other visitors' chats, or the live web.",
  "Return only the answer text without a source footer.",
  "",
];

type PreparedPortfolioTurn = {
  conversation: HostedGemmaMessage[];
  latestUserMessage: string;
  sourceUrls: string[];
  hasSources: boolean;
  /** Set when the question can be answered without calling the provider. */
  shortCircuit: HostedPortfolioChatResult | null;
  systemPrompt: string;
};

function preparePortfolioTurn(messages: HostedGemmaMessage[]): PreparedPortfolioTurn {
  const conversation = normalizeConversation(messages);
  const latestUserMessage = [...conversation]
    .reverse()
    .find((message) => message.role === "user")?.content ?? "";
  if (!latestUserMessage) {
    throw new Error("A user message is required.");
  }

  const sources = retrievePortfolioKnowledge(latestUserMessage);
  const sourceUrls = Array.from(new Set(sources.map((source) => source.url)));

  return {
    conversation,
    latestUserMessage,
    sourceUrls,
    hasSources: sources.length > 0,
    shortCircuit: shouldDeclineUngroundedPersonalQuestion(latestUserMessage)
      ? {
          answer: declineUnsupportedClaim(latestUserMessage),
          sources: [],
          provider: "portfolio-guard",
          model: HOSTED_GEMMA_MODEL_ID,
        }
      : null,
    systemPrompt: [...SYSTEM_PROMPT_HEADER, formatPortfolioGrounding(latestUserMessage)].join("\n"),
  };
}

export async function answerHostedPortfolioChat({
  apiKey,
  messages,
  fetchImpl,
  signal,
}: AnswerHostedPortfolioChatOptions): Promise<HostedPortfolioChatResult> {
  const turn = preparePortfolioTurn(messages);
  if (turn.shortCircuit) return turn.shortCircuit;

  try {
    const modelAnswer = await generateHostedGemma4({
      apiKey,
      systemPrompt: turn.systemPrompt,
      messages: turn.conversation,
      fetchImpl,
      signal,
    });
    return {
      answer: resolveGroundedPortfolioAnswer(turn.latestUserMessage, modelAnswer),
      sources: turn.sourceUrls,
      provider: "google",
      model: HOSTED_GEMMA_MODEL_ID,
    };
  } catch (error) {
    if (!turn.hasSources) throw error;
    return {
      answer: resolveGroundedPortfolioAnswer(turn.latestUserMessage, ""),
      sources: turn.sourceUrls,
      provider: "grounded-fallback",
      model: HOSTED_GEMMA_MODEL_ID,
    };
  }
}

export type PortfolioChatEvent =
  /** Another slice of the answer, to append to what the client already shows. */
  | { type: "delta"; text: string }
  /**
   * Discard everything streamed so far and show this instead. Emitted when the
   * finished answer turns out to be unusable - the model deflected despite
   * being handed evidence - which can only be judged once it is complete.
   */
  | { type: "replace"; text: string }
  | { type: "done"; sources: string[]; provider: HostedPortfolioChatResult["provider"] };

/**
 * Stream an answer as the provider produces it.
 *
 * Guard decisions and provider failures still yield a complete answer, just in
 * a single delta, so a consumer only has to handle one shape.
 */
export async function* streamHostedPortfolioChat({
  apiKey,
  messages,
  fetchImpl,
  signal,
}: AnswerHostedPortfolioChatOptions): AsyncGenerator<PortfolioChatEvent, void, undefined> {
  const turn = preparePortfolioTurn(messages);

  if (turn.shortCircuit) {
    yield { type: "delta", text: turn.shortCircuit.answer };
    yield { type: "done", sources: turn.shortCircuit.sources, provider: turn.shortCircuit.provider };
    return;
  }

  let streamed = "";
  try {
    for await (const chunk of streamHostedGemma4({
      apiKey,
      systemPrompt: turn.systemPrompt,
      messages: turn.conversation,
      fetchImpl,
      signal,
    })) {
      streamed += chunk;
      yield { type: "delta", text: chunk };
    }
  } catch (error) {
    // Nothing reached the client yet, so the caller can still turn this into a
    // real HTTP status rather than a truncated answer.
    if (streamed === "" && !turn.hasSources) throw error;
    if (streamed === "") {
      yield { type: "delta", text: resolveGroundedPortfolioAnswer(turn.latestUserMessage, "") };
      yield { type: "done", sources: turn.sourceUrls, provider: "grounded-fallback" };
      return;
    }
  }

  const resolved = resolveGroundedPortfolioAnswer(turn.latestUserMessage, streamed);
  if (resolved !== streamed.replace(/\s+/g, " ").trim()) {
    yield { type: "replace", text: resolved };
  }

  yield { type: "done", sources: turn.sourceUrls, provider: "google" };
}
