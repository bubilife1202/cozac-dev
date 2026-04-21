import assert from "node:assert/strict";
import test from "node:test";

import { isCommandExecutionRequest, runLocalAgentTurn } from "../../lib/local-ai/agent-core";

test("detects shell and package-manager command requests", () => {
  assert.equal(isCommandExecutionRequest("please run npm test"), true);
  assert.equal(isCommandExecutionRequest("git status and commit this"), true);
  assert.equal(isCommandExecutionRequest("summarize README.md"), false);
});

test("rejects command execution without dispatching tools", async () => {
  const result = await runLocalAgentTurn("run python script.py");

  assert.equal(result.status, "rejected");
  assert.match(result.message, /browser-native/);
  assert.equal(result.events[0]?.kind, "reject-command");
});

test("can enter ready mode for selected-folder file operations", async () => {
  const result = await runLocalAgentTurn("list selected files", {
    async listEntries() {
      return [{ path: "README.md", name: "README.md", kind: "file", secretLike: false }];
    },
    async readTextFile() {
      throw new Error("not used");
    },
    async writeTextFile() {
      throw new Error("not used");
    },
  });

  assert.equal(result.status, "ready");
  assert.match(result.message, /1 selected-folder entry/);
});
