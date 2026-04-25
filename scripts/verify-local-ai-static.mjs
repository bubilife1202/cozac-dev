import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const requiredFiles = [
  "lib/local-ai/types.ts",
  "lib/local-ai/security.ts",
  "lib/local-ai/diagnostics.ts",
  "lib/local-ai/diff.ts",
  "lib/local-ai/agent-core.ts",
  "lib/local-ai/file-system-adapter.ts",
  "lib/local-ai/storage.ts",
  "lib/local-ai/document-ingest.ts",
  "lib/local-ai/chunking.ts",
  "lib/local-ai/embeddings.ts",
  "lib/local-ai/vector-store.ts",
  "lib/local-ai/retrieval.ts",
  "lib/local-ai/rag-agent-tool.ts",
  "lib/local-ai/model-engine.ts",
  "tests/local-ai/security.test.ts",
  "tests/local-ai/diagnostics.test.ts",
  "tests/local-ai/diff.test.ts",
  "tests/local-ai/agent-core.test.ts",
  "tests/local-ai/rag.test.ts",
  "tests/local-ai/model-engine.test.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    failures.push(`missing required Local Agent test/core file: ${file}`);
  }
}

function walk(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return walk(path);
    }
    return [path];
  });
}

const sourceFiles = [
  ...walk(join(root, "lib", "local-ai")),
  ...walk(join(root, "components", "apps", "local-ai")),
].filter((path) => /\.(ts|tsx|js|jsx|mjs)$/.test(path));

const localAiProofAndDocFiles = [
  "scripts/prove-local-ai-model.mjs",
  "scripts/prove-local-ai-e2b-model.mjs",
  "tasks/local-ai-e2b-model-proof.md",
  "tasks/local-ai-verification-checklist.md",
]
  .map((file) => join(root, file))
  .filter((path) => existsSync(path));

const combined = sourceFiles
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));

const localAiProofAndDocs = localAiProofAndDocFiles
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));

for (const { path, text } of combined) {
  if (/MessageQueue/.test(text)) {
    failures.push(`${path}: Local Agent must not import or call MessageQueue`);
  }
  if (/\/api\/chat/.test(text)) {
    failures.push(`${path}: Local Agent must not call /api/chat`);
  }
  if (/from ["']node:child_process["']|from ["']child_process["']|require\(["']child_process["']\)|\b(exec|spawn)\s*\(/i.test(text)) {
    failures.push(`${path}: Local Agent v1 must not expose shell process execution paths`);
  }
  if (/https?:\/\/localhost|https?:\/\/127\.0\.0\.1/i.test(text)) {
    failures.push(`${path}: Local Agent v1 must not use a localhost bridge`);
  }
  if (/\.cozac-agent/.test(text)) {
    failures.push(`${path}: Local Agent v1 must not create or reference automatic .cozac-agent storage`);
  }
  if (/\bfetch\s*\(/.test(text)) {
    failures.push(`${path}: fetch() requires manual review before Local Agent can prove no local content leaves the browser`);
  }

  const rawFsApi = /FileSystemDirectoryHandle|FileSystemFileHandle|showDirectoryPicker/.test(text);
  if (rawFsApi && path !== "lib/local-ai/file-system-adapter.ts") {
    failures.push(`${path}: raw File System Access API must stay isolated to lib/local-ai/file-system-adapter.ts`);
  }
}

for (const { path, text } of localAiProofAndDocs) {
  if (/gemma-3|Gemma 3|270M|phone-270m/.test(text)) {
    failures.push(`${path}: Local Agent proof/docs must reference current Gemma 4 or SmolLM2 135M paths, not stale Gemma 3/270M labels`);
  }
}

const messagesFiles = walk(join(root, "components", "apps", "messages")).filter((path) => /\.(ts|tsx)$/.test(path));
for (const file of messagesFiles) {
  const text = readFileSync(file, "utf8");
  if (/local-ai|Local Agent/i.test(text) && /MessageQueue|\/api\/chat/.test(text)) {
    failures.push(`${relative(root, file)}: Messages Local Agent entry must not enter the existing send queue or /api/chat path`);
  }
}

if (failures.length > 0) {
  console.error("Local Agent static verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Local Agent static verification passed (${requiredFiles.length} required files, ${combined.length} source files, ${localAiProofAndDocs.length} proof/doc files scanned).`);
