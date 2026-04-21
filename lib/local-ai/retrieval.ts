import type { LocalDocumentChunk, RetrievalMatch } from "./types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣_]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

export function retrieveLexicalChunks(
  query: string,
  chunks: LocalDocumentChunk[],
  limit = 5,
): RetrievalMatch[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => {
      const textTerms = tokenize(`${chunk.path} ${chunk.text}`);
      const matchedTerms = queryTerms.filter((term) => textTerms.includes(term));
      const score = matchedTerms.reduce((sum, term) => {
        const frequency = textTerms.filter((textTerm) => textTerm === term).length;
        const pathBoost = chunk.path.toLowerCase().includes(term) ? 2 : 0;
        return sum + frequency + pathBoost;
      }, 0);

      return { chunk, score, matchedTerms };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex)
    .slice(0, limit);
}
