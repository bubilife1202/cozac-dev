export const HOSTED_GEMMA_MODEL_ID = "gemma-4-26b-a4b-it" as const;

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export type HostedGemmaMessage = {
  role: "user" | "assistant";
  content: string;
};

export class HostedGemmaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HostedGemmaError";
  }
}

type GenerateHostedGemma4Options = {
  apiKey: string;
  systemPrompt: string;
  messages: HostedGemmaMessage[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
  error?: { message?: string };
};

function buildRequestBody(systemPrompt: string, messages: HostedGemmaMessage[]): string {
  return JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      maxOutputTokens: 256,
      temperature: 0.2,
      topP: 0.9,
      thinkingConfig: {
        thinkingLevel: "minimal",
      },
    },
  });
}

function extractAnswer(payload: GeminiGenerateContentResponse): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.filter((part) => part.thought !== true)
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

async function callHostedGemma4(
  endpoint: string,
  { apiKey, systemPrompt, messages, fetchImpl = fetch, signal }: GenerateHostedGemma4Options,
): Promise<Response> {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    throw new HostedGemmaError("Gemma 4 API key is not configured.", 503);
  }

  const response = await fetchImpl(`${GEMINI_API_BASE_URL}/${HOSTED_GEMMA_MODEL_ID}:${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": normalizedApiKey,
    },
    body: buildRequestBody(systemPrompt, messages),
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse;
    throw new HostedGemmaError(
      payload.error?.message?.trim() || `Gemma 4 request failed with status ${response.status}.`,
      response.status,
    );
  }

  return response;
}

export async function generateHostedGemma4(options: GenerateHostedGemma4Options): Promise<string> {
  const response = await callHostedGemma4("generateContent", options);
  const payload = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse;
  const answer = extractAnswer(payload).trim();

  if (!answer) {
    throw new HostedGemmaError("Gemma 4 returned an empty response.", 502);
  }

  return answer;
}

/**
 * Yield the answer as it is generated.
 *
 * The provider speaks server-sent events; each `data:` line carries another
 * GenerateContentResponse holding the next slice of text. Failures that happen
 * before the first chunk still surface as HostedGemmaError, so a caller can
 * turn them into a real HTTP status instead of a half-written stream.
 */
export async function* streamHostedGemma4(
  options: GenerateHostedGemma4Options,
): AsyncGenerator<string, void, undefined> {
  const response = await callHostedGemma4("streamGenerateContent?alt=sse", options);
  const body = response.body;
  if (!body) {
    throw new HostedGemmaError("Gemma 4 returned no response body.", 502);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let produced = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let payload: GeminiGenerateContentResponse;
        try {
          payload = JSON.parse(data) as GeminiGenerateContentResponse;
        } catch {
          continue;
        }

        const chunk = extractAnswer(payload);
        if (chunk) {
          produced = true;
          yield chunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!produced) {
    throw new HostedGemmaError("Gemma 4 returned an empty response.", 502);
  }
}
