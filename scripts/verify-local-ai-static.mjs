import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const requiredFiles = [
  "lib/local-ai/hosted-gemma.ts",
  "lib/local-ai/hosted-portfolio-chat.ts",
  "lib/local-ai/portfolio-knowledge.ts",
  "lib/messages/message-queue.ts",
  "app/api/portfolio-chat/route.ts",
  "components/apps/messages/app.tsx",
  "components/apps/messages/chat-area.tsx",
  "app/(desktop)/local-ai/page.tsx",
  "tests/local-ai/hosted-gemma.test.ts",
  "tests/local-ai/messages-portfolio-integration.test.ts",
];

function read(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`missing required hosted portfolio AI file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

const sources = Object.fromEntries(
  requiredFiles.map((relativePath) => [relativePath, read(relativePath)]),
);
const hostedGemma = sources["lib/local-ai/hosted-gemma.ts"];
const hostedPortfolio = sources["lib/local-ai/hosted-portfolio-chat.ts"];
const portfolioKnowledge = sources["lib/local-ai/portfolio-knowledge.ts"];
const messageQueue = sources["lib/messages/message-queue.ts"];
const portfolioRoute = sources["app/api/portfolio-chat/route.ts"];
const messagesApp = sources["components/apps/messages/app.tsx"];
const chatArea = sources["components/apps/messages/chat-area.tsx"];
const redirectRoute = sources["app/(desktop)/local-ai/page.tsx"];

if (existsSync(join(root, "components", "apps", "local-ai"))) {
  failures.push("standalone components/apps/local-ai workbench must remain removed");
}
if (existsSync(join(root, "components", "apps", "messages", "portfolio-model-status.tsx"))) {
  failures.push("Messages must not ask visitors to download the retired browser model");
}

for (const relativePath of [
  "lib/app-config.ts",
  "components/desktop/desktop.tsx",
  "components/mobile/mobile-shell.tsx",
]) {
  const text = read(relativePath);
  if (/LocalAiApp|id:\s*["']local-ai["']/.test(text)) {
    failures.push(`${relativePath}: standalone Local Agent must not be exposed`);
  }
}

if (!/redirect\(["']\/messages\?id=cozac-portfolio-chat["']\)/.test(redirectRoute)) {
  failures.push("legacy /local-ai route must redirect to the cozac Messages conversation");
}

for (const token of [
  "gemma-4-26b-a4b-it",
  "generativelanguage.googleapis.com",
  "x-goog-api-key",
  "systemInstruction",
]) {
  if (!hostedGemma.includes(token)) {
    failures.push(`hosted Gemma client is missing ${token}`);
  }
}
if (/\?(?:key|api_key)=/i.test(hostedGemma)) {
  failures.push("Gemma API key must be sent in a server header, not the request URL");
}

for (const token of [
  "formatPortfolioGrounding",
  "resolveGroundedPortfolioAnswer",
  "shouldDeclineUngroundedPersonalQuestion",
  "generateHostedGemma4",
  "streamHostedGemma4",
]) {
  if (!hostedPortfolio.includes(token)) {
    failures.push(`hosted portfolio service is missing ${token}`);
  }
}
if (!/resolveGroundedPortfolioAnswer/.test(portfolioKnowledge)) {
  failures.push("portfolio knowledge must validate weak or ungrounded model answers");
}

for (const token of [
  "GEMINI_API_KEY",
  "streamHostedPortfolioChat",
  "consumeRateLimit",
  "AbortSignal.timeout",
]) {
  if (!portfolioRoute.includes(token)) {
    failures.push(`hosted portfolio route is missing ${token}`);
  }
}
if (/NEXT_PUBLIC_[A-Z_]*(?:GEMINI|GOOGLE)/.test(`${portfolioRoute}\n${hostedGemma}`)) {
  failures.push("Google Gemma credentials must never use a NEXT_PUBLIC environment variable");
}

const portfolioBranch = messageQueue.indexOf("isPortfolioRecipient(conversation.recipients[0])");
const genericServerBranch = messageQueue.indexOf("this.fetchWithRetry(");
if (
  portfolioBranch < 0 ||
  genericServerBranch < 0 ||
  portfolioBranch > genericServerBranch
) {
  failures.push("cozac portfolio chat must branch before the generic server chat path");
}
if (!messageQueue.includes('fetch("/api/portfolio-chat"')) {
  failures.push("Messages must send cozac conversation history to /api/portfolio-chat");
}
for (const retiredToken of [
  "generateBrowserLocalAnswer",
  "getBrowserLocalModelSnapshot",
  "loadBrowserLocalModel",
  "hasLocalAiModelCache",
]) {
  if (messageQueue.includes(retiredToken)) {
    failures.push(`Messages must not depend on retired browser runtime ${retiredToken}`);
  }
}

if (/PortfolioModelStatus|isPortfolioChat/.test(chatArea)) {
  failures.push("Messages chat area must not render a browser model download card");
}
if (!/clearLocalAiModelCaches/.test(messagesApp)) {
  failures.push("Messages must clear obsolete browser model caches once after migration");
}

for (const [relativePath, text] of [
  ["lib/local-ai/hosted-gemma.ts", hostedGemma],
  ["lib/local-ai/hosted-portfolio-chat.ts", hostedPortfolio],
  ["app/api/portfolio-chat/route.ts", portfolioRoute],
]) {
  if (/from ["'](?:node:)?child_process["']|require\(["'](?:node:)?child_process["']\)|\b(?:exec|spawn)\s*\(/i.test(text)) {
    failures.push(`${relativePath}: hosted portfolio AI must not expose shell execution`);
  }
  if (/https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(text)) {
    failures.push(`${relativePath}: hosted portfolio AI must not use a localhost bridge`);
  }
}

if (failures.length > 0) {
  console.error("Messages hosted portfolio AI static verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Messages hosted portfolio AI static verification passed (${requiredFiles.length} required files, Google Gemma 4 server route, no visitor model download).`,
);
