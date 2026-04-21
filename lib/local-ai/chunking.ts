import type { LocalDocument, LocalDocumentChunk } from "./types";

export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
};

export function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function chooseBreak(text: string, start: number, hardEnd: number): number {
  const breakpoints = ["\n\n", "\n", ". ", " "];
  for (const breakpoint of breakpoints) {
    const candidate = text.lastIndexOf(breakpoint, hardEnd);
    if (candidate > start + Math.floor((hardEnd - start) * 0.5)) {
      return candidate + breakpoint.length;
    }
  }
  return hardEnd;
}

export function chunkDocument(document: LocalDocument, options: ChunkOptions = {}): LocalDocumentChunk[] {
  const maxChars = Math.max(32, options.maxChars ?? 1200);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? 120, Math.floor(maxChars / 3)));
  const chunks: LocalDocumentChunk[] = [];
  let startOffset = 0;

  while (startOffset < document.text.length) {
    const hardEnd = Math.min(document.text.length, startOffset + maxChars);
    const endOffset = hardEnd === document.text.length ? hardEnd : chooseBreak(document.text, startOffset, hardEnd);
    const text = document.text.slice(startOffset, endOffset).trim();

    if (text) {
      chunks.push({
        id: `${document.id}:${chunks.length}`,
        documentId: document.id,
        path: document.path,
        chunkIndex: chunks.length,
        text,
        contentHash: hashText(text),
        startOffset,
        endOffset,
      });
    }

    if (endOffset >= document.text.length) {
      break;
    }

    startOffset = Math.max(endOffset - overlapChars, startOffset + 1);
  }

  return chunks;
}
