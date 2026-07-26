import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string): string {
  const absolutePath = join(process.cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

test("calls hosted Gemma 4 with a server-only key and structured conversation roles", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/hosted-gemma.js",
  );
  assert.equal(
    existsSync(compiledModulePath),
    true,
    "hosted Gemma 4 module must exist",
  );

  const hostedGemma = await import(compiledModulePath) as {
    HOSTED_GEMMA_MODEL_ID: string;
    generateHostedGemma4: (options: {
      apiKey: string;
      systemPrompt: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => Promise<string>;
  };

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const answer = await hostedGemma.generateHostedGemma4({
    apiKey: "server-secret-key",
    systemPrompt: "공개 포트폴리오 근거만 사용하세요.",
    messages: [
      { role: "user", content: "한화시스템 경력은?" },
      { role: "assistant", content: "Edge AI 경험이 있어요." },
      { role: "user", content: "그중 Jetson으로 뭘 했어?" },
    ],
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Jetson 다중 카메라 AI를 개발했어요." }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(hostedGemma.HOSTED_GEMMA_MODEL_ID, "gemma-4-26b-a4b-it");
  assert.match(capturedUrl, /gemma-4-26b-a4b-it:generateContent$/);
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("x-goog-api-key"), "server-secret-key");

  const body = JSON.parse(String(capturedInit?.body)) as {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  };
  assert.match(body.systemInstruction.parts[0]?.text ?? "", /공개 포트폴리오/);
  assert.deepEqual(body.contents.map((message) => message.role), [
    "user",
    "model",
    "user",
  ]);
  assert.equal(String(capturedInit?.body).includes("server-secret-key"), false);
  assert.equal(answer, "Jetson 다중 카메라 AI를 개발했어요.");
});

test("omits Gemma 4 thought parts from the visible answer", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/hosted-gemma.js",
  );
  assert.equal(existsSync(compiledModulePath), true);
  const hostedGemma = await import(compiledModulePath) as {
    generateHostedGemma4: (options: {
      apiKey: string;
      systemPrompt: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => Promise<string>;
  };

  const answer = await hostedGemma.generateHostedGemma4({
    apiKey: "server-key",
    systemPrompt: "최종 답변만 보여주세요.",
    messages: [{ role: "user", content: "한화시스템 경력은?" }],
    fetchImpl: async () => new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "사용자에게 보이면 안 되는 내부 사고 과정" },
                { text: "Jetson 기반 Edge AI를 개발했습니다." },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  });

  assert.equal(answer, "Jetson 기반 Edge AI를 개발했습니다.");
  assert.equal(answer.includes("내부 사고 과정"), false);
});

test("uses minimal Gemma 4 thinking for fast portfolio chat replies", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/hosted-gemma.js",
  );
  assert.equal(existsSync(compiledModulePath), true);
  const hostedGemma = await import(compiledModulePath) as {
    generateHostedGemma4: (options: {
      apiKey: string;
      systemPrompt: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => Promise<string>;
  };

  let requestBody = "";
  await hostedGemma.generateHostedGemma4({
    apiKey: "server-key",
    systemPrompt: "짧게 답하세요.",
    messages: [{ role: "user", content: "안녕" }],
    fetchImpl: async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "안녕하세요!" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const parsed = JSON.parse(requestBody) as {
    generationConfig?: { thinkingConfig?: { thinkingLevel?: string } };
  };
  assert.equal(
    parsed.generationConfig?.thinkingConfig?.thinkingLevel,
    "minimal",
  );
});

test("turns hosted Gemma quota failures into a typed provider error", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/hosted-gemma.js",
  );
  assert.equal(existsSync(compiledModulePath), true);
  const hostedGemma = await import(compiledModulePath) as {
    HostedGemmaError: new (message: string, status: number) => Error & { status: number };
    generateHostedGemma4: (options: {
      apiKey: string;
      systemPrompt: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => Promise<string>;
  };

  await assert.rejects(
    hostedGemma.generateHostedGemma4({
      apiKey: "never-leak-this-key",
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello" }],
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: "quota exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as { status?: number }).status, 429);
      assert.equal((error as Error).message.includes("never-leak-this-key"), false);
      return true;
    },
  );
});

test("grounds hosted Gemma answers and skips the provider for unsupported personal claims", async () => {
  const compiledModulePath = join(
    __dirname,
    "../../lib/local-ai/hosted-portfolio-chat.js",
  );
  assert.equal(
    existsSync(compiledModulePath),
    true,
    "hosted portfolio chat service must exist",
  );
  const portfolioChat = await import(compiledModulePath) as {
    answerHostedPortfolioChat: (options: {
      apiKey: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => Promise<{
      answer: string;
      sources: string[];
      provider: string;
      model: string;
    }>;
  };

  let providerCalls = 0;
  const grounded = await portfolioChat.answerHostedPortfolioChat({
    apiKey: "server-key",
    messages: [
      { role: "assistant", content: "안녕하세요. 무엇이든 물어보세요." },
      { role: "user", content: "한화시스템 경력은?" },
      { role: "assistant", content: "Edge AI 경험이 있어요." },
      { role: "user", content: "그중 Jetson으로 뭘 했어?" },
    ],
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "질문을 명확히 해주세요." }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(providerCalls, 1);
  assert.match(grounded.answer, /Jetson Edge 디바이스에서 다중 카메라/);
  assert.deepEqual(grounded.sources, ["/notes/experience"]);
  assert.equal(grounded.provider, "google");
  assert.equal(grounded.model, "gemma-4-26b-a4b-it");

  const declined = await portfolioChat.answerHostedPortfolioChat({
    apiKey: "server-key",
    messages: [{ role: "user", content: "바리스타 경험은 있어?" }],
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error("provider must not be called");
    },
  });

  assert.equal(providerCalls, 1);
  assert.match(declined.answer, /공개 포트폴리오에서 확인되지 않아요/);
  assert.deepEqual(declined.sources, []);
  assert.equal(declined.provider, "portfolio-guard");
});

test("streams the answer as the provider produces it", async () => {
  const portfolioChat = await import(
    join(__dirname, "../../lib/local-ai/hosted-portfolio-chat.js")
  ) as {
    streamHostedPortfolioChat: (options: {
      apiKey: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => AsyncGenerator<
      { type: string; text?: string; sources?: string[]; provider?: string },
      void,
      undefined
    >;
  };

  const sse = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Jetson Edge "}]}}]}',
    'data: {"candidates":[{"content":{"parts":[{"text":"디바이스에서 다중 카메라 "}]}}]}',
    'data: {"candidates":[{"content":{"parts":[{"text":"실시간 영상 감지 AI를 개발했어요."}]}}]}',
    "",
  ].join("\n\n");

  let capturedUrl = "";
  const events: Array<{ type: string; text?: string; sources?: string[] }> = [];
  for await (const event of portfolioChat.streamHostedPortfolioChat({
    apiKey: "server-secret-key",
    messages: [{ role: "user", content: "Jetson으로 뭘 했어?" }],
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  })) {
    events.push(event);
  }

  assert.match(capturedUrl, /streamGenerateContent\?alt=sse$/);

  const deltas = events.filter((event) => event.type === "delta");
  assert.equal(deltas.length, 3, "each provider chunk reaches the client separately");
  assert.equal(
    deltas.map((event) => event.text).join(""),
    "Jetson Edge 디바이스에서 다중 카메라 실시간 영상 감지 AI를 개발했어요.",
  );

  // A usable answer must not be swapped out at the end.
  assert.equal(events.some((event) => event.type === "replace"), false);

  const done = events.at(-1);
  assert.equal(done?.type, "done");
  assert.deepEqual(done?.sources, ["/notes/experience"]);
});

test("replaces a finished answer only when the model deflected despite evidence", async () => {
  const portfolioChat = await import(
    join(__dirname, "../../lib/local-ai/hosted-portfolio-chat.js")
  ) as {
    streamHostedPortfolioChat: (options: {
      apiKey: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      fetchImpl: typeof fetch;
    }) => AsyncGenerator<{ type: string; text?: string }, void, undefined>;
  };

  const events: Array<{ type: string; text?: string }> = [];
  for await (const event of portfolioChat.streamHostedPortfolioChat({
    apiKey: "server-secret-key",
    messages: [{ role: "user", content: "Jetson으로 뭘 했어?" }],
    fetchImpl: async () =>
      new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"어떤 질문인지 명확하게 알려주세요."}]}}]}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
  })) {
    events.push(event);
  }

  const replaced = events.find((event) => event.type === "replace");
  assert.match(replaced?.text ?? "", /다중 카메라 실시간 영상 감지 AI/);
});

test("the per-process limiter bounds a single instance and resets the window", async () => {
  const compiledModulePath = join(__dirname, "../../lib/rate-limit.js");
  assert.equal(existsSync(compiledModulePath), true);
  const rateLimit = await import(compiledModulePath) as {
    createInMemoryRateLimiter: (options: {
      limit: number;
      windowMs: number;
      now: () => number;
    }) => {
      consume: (key: string) => { allowed: boolean; retryAfterSeconds: number };
    };
    hashRateLimitSubject: (subject: string) => string;
  };

  let now = 1_000;
  const limiter = rateLimit.createInMemoryRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => now,
  });

  assert.equal(limiter.consume("visitor-a").allowed, true);
  assert.equal(limiter.consume("visitor-a").allowed, true);
  const blocked = limiter.consume("visitor-a");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(limiter.consume("visitor-b").allowed, true);

  now += 60_001;
  assert.equal(limiter.consume("visitor-a").allowed, true);

  // Caller identity must never reach the database in the clear.
  const hashed = rateLimit.hashRateLimitSubject("203.0.113.7");
  assert.match(hashed, /^[0-9a-f]{64}$/);
  assert.notEqual(hashed, "203.0.113.7");
  assert.equal(hashed, rateLimit.hashRateLimitSubject("203.0.113.7"));
});

test("the portfolio chat route counts requests in a shared window", () => {
  const route = source("app/api/portfolio-chat/route.ts");

  assert.match(route, /consumeRateLimit/);
  assert.match(route, /RATE_LIMIT_BUCKET/);
  // The per-process Map must not be the primary cap: it is only reached when
  // the shared counter returns null.
  assert.match(route, /\)\) \?\? localRateLimiter\.consume\(visitorKey\)/);

  const migration = source("supabase/migrations/20260726000000_rate_limits.sql");
  assert.match(migration, /consume_rate_limit/);
  assert.match(migration, /ON CONFLICT \(bucket, subject, window_start\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.consume_rate_limit[\s\S]*TO service_role/);
});
