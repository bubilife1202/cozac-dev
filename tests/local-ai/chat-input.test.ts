import assert from "node:assert/strict";
import test from "node:test";

import { getChatInputKeyIntent } from "../../lib/local-ai/chat-input";

test("submits chat input on bare Enter", () => {
  assert.equal(getChatInputKeyIntent({ key: "Enter" }), "submit");
});

test("keeps Shift+Enter as a newline", () => {
  assert.equal(getChatInputKeyIntent({ key: "Enter", shiftKey: true }), "newline");
});

test("keeps modifier Enter chords available for textarea input", () => {
  assert.equal(getChatInputKeyIntent({ key: "Enter", altKey: true }), "newline");
  assert.equal(getChatInputKeyIntent({ key: "Enter", ctrlKey: true }), "newline");
  assert.equal(getChatInputKeyIntent({ key: "Enter", metaKey: true }), "newline");
});

test("ignores non-Enter keys", () => {
  assert.equal(getChatInputKeyIntent({ key: "a" }), "ignore");
});

test("does not submit while IME composition is active", () => {
  assert.equal(getChatInputKeyIntent({ key: "Enter", isComposing: true }), "ignore");
});

test("does not submit during legacy IME composition key events", () => {
  assert.equal(getChatInputKeyIntent({ key: "Enter", keyCode: 229 }), "ignore");
});
