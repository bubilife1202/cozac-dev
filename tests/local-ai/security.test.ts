import assert from "node:assert/strict";
import test from "node:test";

import {
  SECRET_OPERATION_TYPES,
  createSecretApprovalRegistry,
  isSecretLikePath,
  redactSecretContentForLog,
} from "../../lib/local-ai/security";

test("detects common secret-like local paths without over-flagging normal text files", () => {
  assert.equal(isSecretLikePath(".env"), true);
  assert.equal(isSecretLikePath("config/.env.local"), true);
  assert.equal(isSecretLikePath("keys/id_ed25519"), true);
  assert.equal(isSecretLikePath("certs/site.pem"), true);
  assert.equal(isSecretLikePath(".aws/credentials"), true);
  assert.equal(isSecretLikePath("notes/project-plan.md"), false);
});

test("requires operation-scoped single-use approvals for secret-like paths", () => {
  const registry = createSecretApprovalRegistry();
  const grant = registry.grant({
    path: ".env.local",
    operation: "read",
    reason: "User clicked approve for this read only",
  });

  assert.equal(registry.consume({ path: ".env.local", operation: "write", approvalId: grant.id }), false);
  assert.equal(registry.consume({ path: ".env.local", operation: "read", approvalId: grant.id }), true);
  assert.equal(registry.consume({ path: ".env.local", operation: "read", approvalId: grant.id }), false);
  assert.equal(registry.consume({ path: "README.md", operation: "read" }), true);
});

test("covers every secret-sensitive RAG and file operation from the test spec", () => {
  assert.deepEqual([...SECRET_OPERATION_TYPES], [
    "read",
    "write",
    "diff",
    "extract",
    "chunk",
    "embed",
    "index",
    "retrieve",
    "log",
    "context",
  ]);
});

test("redacts secret-like contents before log/model-context surfaces", () => {
  assert.match(redactSecretContentForLog(".env", "TOKEN=abc"), /redacted secret-like content/);
  assert.equal(redactSecretContentForLog("README.md", "hello"), "hello");
});
