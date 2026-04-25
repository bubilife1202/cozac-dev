# Local Agent Verification Checklist

Source of truth:

- `/Users/cozac/Code/cozac-dev/.omx/specs/deep-interview-local-ai-agent.md`
- `/Users/cozac/Code/cozac-dev/.omx/plans/prd-local-ai-agent.md`
- `/Users/cozac/Code/cozac-dev/.omx/plans/test-spec-local-ai-agent.md`

This checklist is owned by the verification/integration lane. It is intentionally separate from the implementation lanes so it can be run after worker commits are integrated.

## Integration readiness

Before full verification, confirm the implementation lanes have landed:

- Shell integration: `lib/app-config.ts`, `public/local-ai.svg`, `app/(desktop)/local-ai/page.tsx`, `components/desktop/desktop.tsx`, `components/mobile/mobile-shell.tsx`.
- Core library: `lib/local-ai/*`.
- UI/workbench: `components/apps/local-ai/*`.
- Messages integration, if any, is only a safe entry/deep-link/read-only summary and never uses `MessageQueue` or `/api/chat`.

## Required automated checks

Run from the repository root after integration:

```bash
bash tasks/verify-local-ai-static.sh
npm run prove:local-ai-model -- --cache-dir .omx/tmp/local-ai-model-cache --max-new-tokens 16
npm run prove:local-ai-e2b-model -- --cache-dir .omx/tmp/local-ai-e2b-model-cache --max-new-tokens 16
npm run lint
npm run typecheck
npm run build
```

Expected static-check posture:

- `MessageQueue` imports/calls and `/api/chat` calls must not appear in Local Agent code; safety-copy mentions are reviewed explicitly.
- File System Access operations must be isolated to `lib/local-ai/file-system-adapter.ts`; diagnostics may only detect support.
- Node/shell execution imports or APIs must not appear in Local Agent code.
- Cloud LLM fallback imports (`openai`, `@ai-sdk/openai`, Braintrust) must not appear in Local Agent code.
- Any raw `fetch(` in Local Agent code requires manual review proving it does not send local file content, folder names, transcripts, diagnostics, chunks, embeddings, tool logs, or retrieval context to an app/server route.
- `prove:local-ai-model` must still download/load/generate with the SmolLM2 135M ONNX smoke model.
- `prove:local-ai-e2b-model` must download/load/generate with `onnx-community/gemma-4-E2B-it-ONNX` through `AutoProcessor` + `AutoModelForImageTextToText` and the model-card dtype documented in `tasks/local-ai-e2b-model-proof.md`.

## Required manual browser verification

Use a temporary local folder containing:

- `README.md`
- `notes.txt`
- `data.json`
- `.env`

Desktop viewport:

1. Open `/local-ai`.
2. Confirm the Local Agent route/workbench renders without console errors.
3. Confirm diagnostics show browser support, File System Access support, WebGPU, CPU cores, memory/quota/private-mode state where available, and a Gemma 4 E2B/E4B-class recommendation.
4. Select the temporary folder by user gesture.
5. Confirm only selected-folder entries are listed.
6. Read `README.md` and confirm operation logging is local-only.
7. Create or edit a non-secret text file.
8. Confirm a diff/change summary appears.
9. Attempt to read `.env`; deny approval and confirm content is absent from logs/context.
10. Approve one `.env` read operation and confirm the approval is scoped to that operation only.
11. Index non-secret Markdown/text materials and confirm retrieval cites local chunks.
12. Ask for `npm test`, `git status`, `python`, or `ollama`; confirm the UI rejects command execution and no shell path exists.
13. Reload and confirm IndexedDB/session state restores where browser permissions allow.

Mobile viewport:

1. Open `/local-ai`.
2. Confirm the mobile shell renders the Local Agent entry/workbench or a clear unsupported/degraded state.
3. Confirm no mobile path sends selected local content to app server routes.

Network/observability:

- Browser console: no uncaught errors in the core flow.
- Network panel: no selected file content, folder names, transcripts, diagnostics, chunks, embeddings, retrieval context, or tool logs sent to app routes.
- Model/runtime download traffic, if present, is distinguishable from user-content transfer.

## Completion evidence template

```text
Static: PASS/FAIL — bash tasks/verify-local-ai-static.sh — <summary>
SmolLM2 135M model proof: PASS/FAIL — npm run prove:local-ai-model -- --cache-dir .omx/tmp/local-ai-model-cache --max-new-tokens 16 — <answer/evidence>
E2B model proof: PASS/FAIL — npm run prove:local-ai-e2b-model -- --cache-dir .omx/tmp/local-ai-e2b-model-cache --max-new-tokens 16 — <answer/evidence>
Lint: PASS/FAIL — npm run lint — <summary>
Typecheck: PASS/FAIL — npm run typecheck — <summary>
Build: PASS/FAIL — npm run build — <summary>
Desktop browser: PASS/FAIL — <browser/version + evidence>
Mobile browser: PASS/FAIL — <viewport/browser + evidence>
Network/content leakage: PASS/FAIL — <evidence>
Known gaps/pre-existing failures: <none or exact command/file output>
```
