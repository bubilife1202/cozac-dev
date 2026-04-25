# Local Agent Gemma 4 E2B Proof

Purpose: prove the Local Agent runtime plan can download, load, and generate with a 2B-class local model while keeping the browser Local Agent v1 boundary local-only.

## Model source

- Model: `onnx-community/gemma-4-E2B-it-ONNX`
- Source: Hugging Face model card for Gemma 4 E2B IT ONNX.
- Runtime API required by the model card: `@huggingface/transformers` `AutoProcessor` + `AutoModelForImageTextToText`.
- Dtype copied from the model-card Transformers.js snippet:

```js
{
  embed_tokens: "q8",
  audio_encoder: "q8",
  vision_encoder: "fp16",
  decoder_model_merged: "q4",
}
```

## Repeatable proof command

```bash
npm run prove:local-ai-e2b-model -- \
  --cache-dir .omx/tmp/local-ai-e2b-model-cache \
  --max-new-tokens 16 \
  --prompt "In one short sentence, say what a browser-local Local Agent can do."
```

The script intentionally uses the model-card AutoProcessor/AutoModel path instead of `/api/chat`, `MessageQueue`, a localhost bridge, a shell bridge, or any cloud LLM fallback.

## SmolLM2 135M smoke proof must remain runnable

```bash
npm run prove:local-ai-model -- \
  --cache-dir .omx/tmp/local-ai-model-cache \
  --max-new-tokens 16 \
  --prompt "Name one thing a browser-local AI model can do."
```

The app runtime now exposes the SmolLM2 135M ONNX model as the browser Local Agent v1 smoke model. The E2B script is a repeatable Node/Transformers.js proof that the selected 2B-class ONNX model can load and generate locally; it does not add a server, queue, localhost, shell, or cloud fallback path to the Local Agent UI.

## Verification evidence

Last verified in worker task `verify-and-document-that-the-l/task-1`:

```text
E2B model proof: PASS
Command:
NODE_OPTIONS=--max-old-space-size=24576 npm run prove:local-ai-e2b-model -- --cache-dir .omx/tmp/gemma4-e2b-proof-cache --max-new-tokens 1 --prompt "Say ok."
Evidence:
proof:start model=onnx-community/gemma-4-E2B-it-ONNX requested_device=auto resolved_device=cpu max_new_tokens=1
proof:dtype {"embed_tokens":"q8","audio_encoder":"q8","vision_encoder":"fp16","decoder_model_merged":"q4"}
proof:progress_total loaded=5725522184/5725522184
proof:model_loaded elapsed_ms=3546 files_seen=18 downloads_done=17 ready_events=0
proof:answer "Ok"
proof:done elapsed_ms=4230

SmolLM2 135M smoke proof: PASS
Command:
npm run prove:local-ai-model -- --cache-dir .omx/tmp/local-ai-model-cache --max-new-tokens 16 --prompt "Name one thing a browser-local AI model can do."
Evidence:
proof:loaded elapsed_ms=4583 saw_model_data=true saw_ready=true
proof:answer "One thing a browser-local AI model can do is understand and process information from"
proof:done elapsed_ms=4835

Static/local-only: PASS
Commands:
npm run verify:local-ai
bash tasks/verify-local-ai-static.sh
Evidence:
Local Agent static verification passed (20 required files, 20 source files scanned).
Static Local Agent verification: PASS

Tests/type/lint/build: PASS
Commands:
npm test
npm run lint
npm run typecheck
npm run build
Evidence:
npm test: 25 passed, 0 failed.
npm run lint: exit 0 with 31 pre-existing warnings, 0 errors.
npm run typecheck: exit 0.
npm run build: Compiled successfully; generated 29/29 static pages.
```
