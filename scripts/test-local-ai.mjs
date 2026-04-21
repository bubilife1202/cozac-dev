import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tempRoot = join(root, ".omx", "tmp", "local-ai-tests");
const outDir = join(tempRoot, "out");

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

writeFileSync(
  join(tempRoot, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "CommonJS",
        moduleResolution: "Node",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        types: ["node"],
        rootDir: root,
        outDir,
      },
      include: ["../../../lib/local-ai/**/*.ts", "../../../tests/local-ai/**/*.ts"],
    },
    null,
    2,
  ),
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", ["tsc", "--project", join(tempRoot, "tsconfig.json")]);
const compiledTestDir = join(outDir, "tests", "local-ai");
const compiledTests = readdirSync(compiledTestDir)
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => join(compiledTestDir, file));

run("node", ["--test", ...compiledTests]);
