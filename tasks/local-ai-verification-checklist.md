# Hosted Gemma 4 Portfolio Chat Verification Checklist

The public `cozac` conversation uses Google's hosted `gemma-4-26b-a4b-it`. Visitors do not download or run a browser model.

## Required automated checks

```bash
npm run test:local-ai
npm run verify:local-ai
npm run lint
npm run typecheck
npm run build
```

Expected posture:

- `/local-ai` redirects to `/messages?id=cozac-portfolio-chat`.
- No standalone Local Agent or browser model download card is exposed.
- Messages branches to `/api/portfolio-chat` before the generic `/api/chat` path.
- `GEMINI_API_KEY` exists only in server environment configuration and is sent to Google in the `x-goog-api-key` header.
- `gemma-4-26b-a4b-it` receives structured user/model history and a server-side system instruction.
- Personal facts use verified public portfolio grounding; unsupported claims are declined without spending provider quota.
- Weak model output and provider failures on grounded questions fall back to verified portfolio text.
- Requests are length-limited, time-limited, and rate-limited per visitor.
- Existing browser model caches are removed once after migration; Ollama and machine-level model stores are untouched.

## Required production checks

1. Configure `GEMINI_API_KEY` for Vercel Production without a `NEXT_PUBLIC_` prefix.
2. Deploy and open `/messages?id=cozac-portfolio-chat` on desktop and mobile.
3. Confirm there is no model installation card or download delay.
4. Ask `한화시스템에서 어떤 일을 했어?`, followed by `그중 Jetson으로 뭘 했어?`.
5. Verify the second answer follows context and cites `/notes/experience`.
6. Ask `바리스타 경험은 있어?`; verify the claim is declined without a Google request.
7. Confirm `/api/portfolio-chat` returns 429 after the per-visitor burst limit and does not expose provider details or keys.
8. Confirm production browser logs have no uncaught errors.
