import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string): string {
  const absolutePath = join(process.cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

test("portfolio knowledge retrieves verified public experience and rejects unrelated personal claims", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/portfolio-knowledge.js",
  );
  assert.equal(
    existsSync(compiledModulePath),
    true,
    "portfolio knowledge module must exist",
  );

  const portfolio = await import(compiledModulePath) as {
    retrievePortfolioKnowledge: (query: string) => Array<{
      id: string;
      content: string;
      url: string;
    }>;
    formatPortfolioGrounding: (query: string) => string;
    shouldDeclineUngroundedPersonalQuestion: (query: string) => boolean;
    isLegacyPortfolioMessage: (content: string) => boolean;
    resolveGroundedPortfolioAnswer: (query: string, modelAnswer: string) => string;
  };

  const edgeAi = portfolio.retrievePortfolioKnowledge("Jetson 다중 카메라 영상 AI 경험");
  assert.equal(edgeAi[0]?.id, "hanwha-system-edge-ai");
  assert.match(edgeAi[0]?.content ?? "", /Jetson/);
  assert.equal(edgeAi[0]?.url, "/notes/experience");

  const generalCareer = portfolio.retrievePortfolioKnowledge("경력 알려줘");
  assert.deepEqual(
    generalCareer.map((entry) => entry.id),
    ["hanwha-system-edge-ai", "hanwha-defense", "ainex-medical-ai"],
  );

  assert.deepEqual(
    portfolio.retrievePortfolioKnowledge("바리스타 경험은 있어?"),
    [],
  );
  assert.equal(
    portfolio.shouldDeclineUngroundedPersonalQuestion("바리스타 경험은 있어?"),
    true,
  );
  assert.equal(
    portfolio.shouldDeclineUngroundedPersonalQuestion("안녕하세요"),
    false,
  );
  assert.equal(
    portfolio.isLegacyPortfolioMessage(
      "지금은 챗봇이 비활성화되어 있어요. 필요한 내용은 Notes나 Local Agent에서 먼저 확인해 주세요.",
    ),
    true,
  );
  assert.equal(
    portfolio.isLegacyPortfolioMessage(
      "Gemma 4가 아직 준비되지 않았어요. 대화 위의 ‘이 기기에 모델 받기’를 먼저 눌러주세요.",
    ),
    true,
  );
  assert.equal(
    portfolio.isLegacyPortfolioMessage("사용자가 직접 작성한 메시지"),
    false,
  );
  assert.match(
    portfolio.formatPortfolioGrounding("Solace 프로젝트 알려줘"),
    /Build with TRAE @Seoul 해커톤 최우수상/,
  );
  assert.match(
    portfolio.resolveGroundedPortfolioAnswer(
      "Jetson으로 뭘 했어?",
      "어떤 질문인지 명확하게 알려주시면 답변드릴게요.",
    ),
    /다중 카메라 실시간 영상 감지 AI/,
  );
  assert.equal(
    portfolio.resolveGroundedPortfolioAnswer(
      "Jetson으로 뭘 했어?",
      "Jetson Edge 디바이스에서 다중 카메라 실시간 영상 감지 AI를 개발했어요.",
    ),
    "Jetson Edge 디바이스에서 다중 카메라 실시간 영상 감지 AI를 개발했어요.",
  );

  // A correct paraphrase that happens to use none of the source's literal
  // keywords must survive - it used to be thrown away for the raw KB sentence.
  const paraphrase = "무인 선박 쪽 연구를 하면서 화면 여러 개를 동시에 보는 인식 기능을 만들었어요.";
  assert.equal(
    portfolio.resolveGroundedPortfolioAnswer("한화시스템에서 어떤 일 했어?", paraphrase),
    paraphrase,
  );
});

test("message bubbles escape untrusted content before injecting HTML", () => {
  const bubble = source("components/apps/messages/message-bubble.tsx");

  // Content reaches dangerouslySetInnerHTML, so it has to be escaped first.
  assert.match(bubble, /escapeHtml/);
  assert.match(bubble, /const safeContent = escapeHtml\(content\)/);
  assert.doesNotMatch(bubble, /__html: content \}/);
  assert.doesNotMatch(bubble, /let highlightedContent = content;/);

  // Source references in portfolio answers become real links.
  assert.match(bubble, /linkifyNotePaths/);
});

test("the browser-local model runtime is gone from the bundle", () => {
  for (const removedPath of [
    "lib/local-ai/model-engine.ts",
    "lib/local-ai/webllm-engine.ts",
    "lib/local-ai/agent-core.ts",
    "lib/local-ai/vector-store.ts",
    "lib/local-ai/index.ts",
  ]) {
    assert.equal(existsSync(join(process.cwd(), removedPath)), false, `${removedPath} must not come back`);
  }

  const packageJson = source("package.json");
  for (const dependency of [
    "@mlc-ai/web-llm",
    "@mlc-ai/web-runtime",
    "@mlc-ai/web-tokenizers",
    "@mlc-ai/web-xgrammar",
    "@huggingface/transformers",
  ]) {
    assert.doesNotMatch(packageJson, new RegExp(`"${dependency.replace("/", "\\/")}"`));
  }
});

test("Messages no longer asks each visitor to download a browser model", () => {
  const chatArea = source("components/apps/messages/chat-area.tsx");
  const messagesApp = source("components/apps/messages/app.tsx");

  assert.equal(
    existsSync(join(process.cwd(), "components/apps/messages/portfolio-model-status.tsx")),
    false,
  );
  assert.doesNotMatch(chatArea, /PortfolioModelStatus/);
  assert.doesNotMatch(chatArea, /isPortfolioChat/);
  assert.match(messagesApp, /clearLocalAiModelCaches/);
  assert.match(messagesApp, /cozac\.hostedGemma\.legacyCacheCleared\.v1/);
});

test("cozac portfolio chat uses the hosted Google Gemma 4 route before generic chat", () => {
  const queue = source("lib/messages/message-queue.ts");
  const chatRoute = source("app/api/chat/route.ts");
  const portfolioRoute = source("app/api/portfolio-chat/route.ts");
  const hostedGemma = source("lib/local-ai/hosted-gemma.ts");
  const messagesApp = source("components/apps/messages/app.tsx");
  const initialConversations = source("data/messages/initial-conversations.ts");

  assert.match(queue, /isPortfolioRecipient/);
  assert.match(queue, /fetch\(["']\/api\/portfolio-chat["']/);
  assert.doesNotMatch(queue, /getBrowserLocalModelSnapshot/);
  assert.doesNotMatch(queue, /hasLocalAiModelCache/);
  assert.doesNotMatch(queue, /loadBrowserLocalModel/);
  assert.doesNotMatch(queue, /generateBrowserLocalAnswer/);
  assert.doesNotMatch(queue, /const transcript/);
  assert.doesNotMatch(queue, /processLocalAgentMessage/);
  assert.doesNotMatch(queue, /CHATBOT_DISABLED_MESSAGE_PREFIX/);
  assert.match(portfolioRoute, /GEMINI_API_KEY/);
  assert.match(portfolioRoute, /streamHostedPortfolioChat/);
  assert.match(portfolioRoute, /application\/x-ndjson/);
  assert.match(queue, /readNdjsonStream/);
  assert.match(hostedGemma, /gemma-4-26b-a4b-it/);
  assert.doesNotMatch(`${portfolioRoute}\n${hostedGemma}`, /NEXT_PUBLIC_[A-Z_]*GEM/);
  assert.doesNotMatch(chatRoute, /Notes나 Local Agent/);
  assert.match(chatRoute, /cozac 대화에서 포트폴리오 AI/);
  assert.match(messagesApp, /isLegacyPortfolioMessage/);
  assert.match(initialConversations, /PORTFOLIO_CONVERSATION_ID/);
  assert.match(messagesApp, /deletedInitialIds\.delete\(PORTFOLIO_CONVERSATION_ID\)/);
  assert.match(messagesApp, /id === PORTFOLIO_CONVERSATION_ID/);
});

test("standalone Local Agent UI is removed and its old URL redirects to Messages", () => {
  const windowContext = source("lib/window-context.tsx");
  assert.doesNotMatch(source("lib/app-config.ts"), /id:\s*["']local-ai["']/);
  assert.doesNotMatch(source("components/desktop/desktop.tsx"), /LocalAiApp/);
  assert.doesNotMatch(source("components/mobile/mobile-shell.tsx"), /LocalAiApp/);
  assert.match(windowContext, /validAppIds/);
  assert.doesNotMatch(windowContext, /initialAppId === ["']local-ai["']/);
  assert.equal(existsSync(join(process.cwd(), "components/apps/local-ai")), false);
  assert.match(
    source("app/(desktop)/local-ai/page.tsx"),
    /redirect\(["']\/messages\?id=cozac-portfolio-chat["']\)/,
  );
});
