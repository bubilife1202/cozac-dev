import assert from "node:assert/strict";
import test from "node:test";

import { chunkDocument } from "../../lib/local-ai/chunking";
import {
  createLocalDocument,
  isSupportedLocalDocument,
  requiredDocumentApprovals,
} from "../../lib/local-ai/document-ingest";
import { retrieveFromLocalDocuments } from "../../lib/local-ai/rag-agent-tool";
import { retrieveLexicalChunks } from "../../lib/local-ai/retrieval";

test("chunks local documents with stable metadata and hashes", () => {
  const document = createLocalDocument("materials/README.md", "alpha beta gamma\n\ndelta epsilon zeta");
  const chunks = chunkDocument(document, { maxChars: 20, overlapChars: 4 });

  assert.equal(chunks.length >= 2, true);
  assert.equal(chunks[0]?.documentId, document.id);
  assert.match(chunks[0]?.contentHash ?? "", /^[a-f0-9]{8}$/);
});

test("retrieves relevant chunks using browser-local lexical fallback", () => {
  const document = createLocalDocument(
    "materials/guide.md",
    "Local Agent keeps selected folder content in IndexedDB. Remote upload is not allowed.",
  );
  const chunks = chunkDocument(document, { maxChars: 80 });
  const matches = retrieveLexicalChunks("where is folder content stored", chunks, 1);

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.chunk.path, "materials/guide.md");
  assert.ok(matches[0]?.matchedTerms.includes("folder"));
});

test("marks supported document types and secret RAG stage approvals", () => {
  assert.equal(isSupportedLocalDocument("notes.txt"), true);
  assert.equal(isSupportedLocalDocument("brief.pdf"), false);
  assert.deepEqual(requiredDocumentApprovals(".env"), [
    "read",
    "extract",
    "chunk",
    "embed",
    "index",
    "retrieve",
    "log",
    "context",
  ]);
  assert.deepEqual(requiredDocumentApprovals("README.md"), []);
});

test("formats retrieved local context without server calls", () => {
  const matches = retrieveFromLocalDocuments("Gemma model", [
    createLocalDocument("notes.txt", "Gemma 4 E2B runs locally. Browser storage keeps notes local."),
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.chunk.path, "notes.txt");
});
