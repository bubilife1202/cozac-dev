#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX";
const DEFAULT_PROMPT = "Name one thing a browser-local AI model can do.";

function parseArgs(argv) {
  const options = {
    cacheDir: process.env.LOCAL_AI_MODEL_CACHE_DIR ?? ".omx/tmp/local-ai-model-cache",
    dtype: process.env.LOCAL_AI_MODEL_DTYPE ?? "q4",
    maxNewTokens: Number.parseInt(process.env.LOCAL_AI_MAX_NEW_TOKENS ?? "32", 10),
    prompt: process.env.LOCAL_AI_MODEL_PROMPT ?? DEFAULT_PROMPT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--cache-dir" && next) {
      options.cacheDir = next;
      index += 1;
    } else if (arg === "--dtype" && next) {
      options.dtype = next;
      index += 1;
    } else if (arg === "--max-new-tokens" && next) {
      options.maxNewTokens = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--prompt" && next) {
      options.prompt = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/prove-local-ai-model.mjs [--cache-dir DIR] [--dtype q4|q8|fp16|fp32] [--prompt TEXT]\n\nDownloads/loads ${MODEL_ID} with @huggingface/transformers and verifies non-empty local text generation.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.maxNewTokens) || options.maxNewTokens < 1) {
    throw new Error("--max-new-tokens must be a positive integer");
  }

  return options;
}

async function importTransformers() {
  try {
    return await import("@huggingface/transformers");
  } catch (directError) {
    const packageJson = process.env.TRANSFORMERS_JS_PACKAGE_JSON;
    if (!packageJson) {
      throw new Error(
        "@huggingface/transformers is not installed in this repo. Install the project dependency or set TRANSFORMERS_JS_PACKAGE_JSON=/path/to/package.json for a temporary proof run.",
        { cause: directError },
      );
    }

    const require = createRequire(packageJson);
    return import(require.resolve("@huggingface/transformers"));
  }
}

function normalizeAnswer(output) {
  const generated = output?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    return String(generated.at(-1)?.content ?? "").replace(/\s+/g, " ").trim();
  }
  return String(generated ?? "").replace(/\s+/g, " ").trim();
}

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.cacheDir, { recursive: true });

const started = performance.now();
const { env, pipeline } = await importTransformers();

env.cacheDir = options.cacheDir;
env.useFSCache = true;
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.logLevel = "warn";

let sawModelData = false;
let sawReady = false;

console.log(`proof:start model=${MODEL_ID} dtype=${options.dtype} cache=${options.cacheDir}`);
const generator = await pipeline("text-generation", MODEL_ID, {
  dtype: options.dtype,
  progress_callback: (progress) => {
    if (progress?.file?.includes("onnx/model") && progress.status === "done") {
      sawModelData = true;
    }
    if (progress?.status === "ready") {
      sawReady = true;
    }
  },
});
console.log(`proof:loaded elapsed_ms=${Math.round(performance.now() - started)} saw_model_data=${sawModelData} saw_ready=${sawReady}`);

const output = await generator([
  { role: "system", content: "Answer in one short sentence." },
  { role: "user", content: options.prompt },
], {
  max_new_tokens: options.maxNewTokens,
  do_sample: false,
});

const answer = normalizeAnswer(output);
console.log(`proof:answer ${JSON.stringify(answer)}`);
console.log(`proof:done elapsed_ms=${Math.round(performance.now() - started)}`);

if (!answer) {
  throw new Error("Gemma proof produced empty output");
}
