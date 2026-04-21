#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const MODEL_ID = "onnx-community/gemma-3n-E2B-it-ONNX";
const MODEL_CARD_URL = "https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX";
const MODEL_CARD_DTYPE = Object.freeze({
  embed_tokens: "q8",
  audio_encoder: "q8",
  vision_encoder: "fp16",
  decoder_model_merged: "q4",
});
const DEFAULT_PROMPT = "In one short sentence, say what a browser-local Local Agent can do.";

function parseArgs(argv) {
  const options = {
    cacheDir: process.env.LOCAL_AI_E2B_MODEL_CACHE_DIR ?? ".omx/tmp/local-ai-e2b-model-cache",
    device: process.env.LOCAL_AI_E2B_DEVICE ?? "auto",
    localFilesOnly: process.env.LOCAL_AI_E2B_LOCAL_FILES_ONLY === "1",
    maxNewTokens: Number.parseInt(process.env.LOCAL_AI_E2B_MAX_NEW_TOKENS ?? "16", 10),
    prompt: process.env.LOCAL_AI_E2B_MODEL_PROMPT ?? DEFAULT_PROMPT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--cache-dir" && next) {
      options.cacheDir = next;
      index += 1;
    } else if (arg === "--device" && next) {
      options.device = next;
      index += 1;
    } else if (arg === "--local-files-only") {
      options.localFilesOnly = true;
    } else if (arg === "--max-new-tokens" && next) {
      options.maxNewTokens = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--prompt" && next) {
      options.prompt = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/prove-local-ai-e2b-model.mjs [--cache-dir DIR] [--device auto|webgpu|cpu] [--max-new-tokens N] [--prompt TEXT] [--local-files-only]

Downloads/loads ${MODEL_ID} with @huggingface/transformers AutoProcessor + AutoModelForImageTextToText,
using the Hugging Face model-card dtype:
${JSON.stringify(MODEL_CARD_DTYPE, null, 2)}

Model card: ${MODEL_CARD_URL}`);
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!["auto", "webgpu", "cpu"].includes(options.device)) {
    throw new Error("--device must be one of: auto, webgpu, cpu");
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

function hasWebGPU() {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

function resolveDeviceOption(device) {
  if (device === "webgpu") return { device: "webgpu", label: "webgpu" };
  if (device === "auto" && hasWebGPU()) return { device: "webgpu", label: "webgpu" };
  return { device: undefined, label: "cpu" };
}

function normalizeAnswer(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.cacheDir, { recursive: true });

const started = performance.now();
const { AutoProcessor, AutoModelForImageTextToText, env } = await importTransformers();
const device = resolveDeviceOption(options.device);

env.cacheDir = options.cacheDir;
env.useFSCache = true;
env.allowRemoteModels = !options.localFilesOnly;
env.allowLocalModels = true;
env.localModelPath = options.cacheDir;
env.logLevel = "warn";

const progressStats = {
  downloadsDone: 0,
  readyEvents: 0,
  files: new Set(),
};
const loggedProgressBuckets = new Map();
const loggedStatusKeys = new Set();

function shouldLogProgress(progress) {
  const status = progress?.status ?? "unknown";
  const file = progress?.file ?? progress?.name ?? "unknown";
  if (["initiate", "download", "done", "ready"].includes(status)) {
    const statusKey = `${status}:${file}`;
    if (loggedStatusKeys.has(statusKey)) return false;
    loggedStatusKeys.add(statusKey);
    return true;
  }

  if (typeof progress?.progress !== "number") return false;
  const increment = status === "progress_total" ? 10 : 25;
  const bucket = Math.floor(progress.progress / increment) * increment;
  const progressKey = `${status}:${file}`;
  const previousBucket = loggedProgressBuckets.get(progressKey);
  if (previousBucket === bucket) return false;
  loggedProgressBuckets.set(progressKey, bucket);
  return true;
}

function onProgress(progress) {
  const file = progress?.file ?? progress?.name;
  if (file) progressStats.files.add(file);
  if (progress?.status === "done") progressStats.downloadsDone += 1;
  if (progress?.status === "ready") progressStats.readyEvents += 1;
  if (!shouldLogProgress(progress)) return;

  const percent = typeof progress?.progress === "number" ? ` progress=${Math.round(progress.progress)}` : "";
  const loaded = typeof progress?.loaded === "number" && typeof progress?.total === "number"
    ? ` loaded=${progress.loaded}/${progress.total}`
    : "";
  console.log(`proof:progress status=${progress?.status ?? "unknown"}${file ? ` file=${JSON.stringify(file)}` : ""}${percent}${loaded}`);
}

console.log(`proof:start model=${MODEL_ID} cache=${options.cacheDir} requested_device=${options.device} resolved_device=${device.label} max_new_tokens=${options.maxNewTokens}`);
console.log(`proof:model_card=${MODEL_CARD_URL}`);
console.log(`proof:dtype ${JSON.stringify(MODEL_CARD_DTYPE)}`);

const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
  local_files_only: options.localFilesOnly,
  progress_callback: onProgress,
});
console.log(`proof:processor_loaded elapsed_ms=${Math.round(performance.now() - started)}`);

const modelOptions = {
  dtype: MODEL_CARD_DTYPE,
  local_files_only: options.localFilesOnly,
  progress_callback: onProgress,
};
if (device.device) {
  modelOptions.device = device.device;
}

const model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, modelOptions);
console.log(`proof:model_loaded elapsed_ms=${Math.round(performance.now() - started)} files_seen=${progressStats.files.size} downloads_done=${progressStats.downloadsDone} ready_events=${progressStats.readyEvents}`);

const messages = [
  {
    role: "user",
    content: [{ type: "text", text: options.prompt }],
  },
];
const prompt = processor.apply_chat_template(messages, {
  add_generation_prompt: true,
});
const inputs = await processor(prompt, null, null, {
  add_special_tokens: false,
});
const inputLength = inputs.input_ids?.dims?.at(-1);

const outputs = await model.generate({
  ...inputs,
  max_new_tokens: options.maxNewTokens,
  do_sample: false,
});

const generated = Number.isInteger(inputLength)
  ? outputs.slice(null, [inputLength, null])
  : outputs;
const decoded = processor.batch_decode(generated, {
  skip_special_tokens: true,
});
const answer = normalizeAnswer(decoded?.[0]);

console.log(`proof:answer ${JSON.stringify(answer)}`);
console.log(`proof:done elapsed_ms=${Math.round(performance.now() - started)}`);

if (!answer) {
  throw new Error("Gemma 3n E2B proof produced empty output");
}
