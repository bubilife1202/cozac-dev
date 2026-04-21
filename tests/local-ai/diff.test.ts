import assert from "node:assert/strict";
import test from "node:test";

import { createLineDiffSummary } from "../../lib/local-ai/diff";

test("summarizes inserted lines", () => {
  const diff = createLineDiffSummary("alpha", "alpha\nbeta", "notes.txt");
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.deletedLines, 0);
  assert.match(diff.summary, /notes\.txt: \+1 -0/);
});

test("summarizes deleted lines", () => {
  const diff = createLineDiffSummary("alpha\nbeta", "alpha");
  assert.equal(diff.addedLines, 0);
  assert.equal(diff.deletedLines, 1);
});

test("summarizes edited lines as paired insert and delete", () => {
  const diff = createLineDiffSummary("alpha\nbeta", "alpha\ngamma");
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.deletedLines, 1);
  assert.equal(diff.changedLines, 1);
});
