import {
  streamHostedPortfolioChat,
  type PortfolioChatEvent,
} from "@/lib/local-ai/hosted-portfolio-chat";
import { HostedGemmaError } from "@/lib/local-ai/hosted-gemma";
import { consumeRateLimit, createInMemoryRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_BUCKET = "portfolio-chat";
const RATE_LIMIT_REQUESTS = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

type PortfolioChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RateLimiter = ReturnType<typeof createInMemoryRateLimiter>;
const globalForPortfolioRateLimit = globalThis as typeof globalThis & {
  __cozacPortfolioRateLimiter?: RateLimiter;
};
const localRateLimiter =
  globalForPortfolioRateLimit.__cozacPortfolioRateLimiter ??
  createInMemoryRateLimiter({
    limit: RATE_LIMIT_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_SECONDS * 1_000,
  });
globalForPortfolioRateLimit.__cozacPortfolioRateLimiter = localRateLimiter;

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(extraHeaders).entries()),
    },
  });
}

function getVisitorKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function parseMessages(value: unknown): PortfolioChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is PortfolioChatMessage => {
      if (!message || typeof message !== "object") return false;
      const candidate = message as { role?: unknown; content?: unknown };
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2_000),
    }));
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 50_000) {
    return json({ error: "Request is too large." }, 413);
  }

  const body = await request.json().catch(() => null) as { messages?: unknown } | null;
  const messages = parseMessages(body?.messages);
  if (messages.length === 0 || !messages.some((message) => message.role === "user")) {
    return json({ error: "A user message is required." }, 400);
  }

  const visitorKey = getVisitorKey(request);
  // The shared counter is the real cap. When it is unreachable the per-process
  // limiter still bounds a single instance, which is strictly better than none.
  const rateLimit =
    (await consumeRateLimit({
      bucket: RATE_LIMIT_BUCKET,
      subject: visitorKey,
      limit: RATE_LIMIT_REQUESTS,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    })) ?? localRateLimiter.consume(visitorKey);

  if (!rateLimit.allowed) {
    return json(
      { error: "Too many portfolio chat requests." },
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";

  try {
    const events = streamHostedPortfolioChat({
      apiKey,
      messages,
      signal: AbortSignal.timeout(30_000),
    });

    // Pull the first event before committing to a 200. A provider that fails
    // outright then still produces a real status code instead of an empty
    // stream the client has to guess about.
    const first = await events.next();
    if (first.done) {
      return json({ error: "Hosted Gemma 4 returned nothing." }, 502);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: PortfolioChatEvent) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

        try {
          send(first.value);
          for await (const event of events) {
            send(event);
          }
        } catch (error) {
          console.error("Hosted portfolio chat stream ended early", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Proxies that buffer would defeat the point of streaming.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const status = error instanceof HostedGemmaError ? error.status : 500;
    console.error("Hosted portfolio chat failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      status,
    });
    return json(
      {
        error:
          status === 429
            ? "Gemma 4 free quota is temporarily exhausted."
            : "Hosted Gemma 4 is temporarily unavailable.",
      },
      status >= 400 && status < 600 ? status : 500,
    );
  }
}
