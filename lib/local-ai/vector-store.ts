import type { LocalDocumentChunk, RetrievalMatch } from "./types";
import { cosineSimilarity, createLexicalEmbedding, type LexicalEmbedding } from "./embeddings";

export type VectorStoreRecord = {
  chunk: LocalDocumentChunk;
  embedding: LexicalEmbedding;
};

export function createInMemoryVectorStore(initialChunks: LocalDocumentChunk[] = []) {
  const records: VectorStoreRecord[] = initialChunks.map((chunk) => ({
    chunk,
    embedding: createLexicalEmbedding(chunk.text),
  }));

  return {
    add(chunk: LocalDocumentChunk): void {
      records.push({ chunk, embedding: createLexicalEmbedding(chunk.text) });
    },

    search(query: string, limit = 5): RetrievalMatch[] {
      const queryEmbedding = createLexicalEmbedding(query);
      return records
        .map((record) => ({
          chunk: record.chunk,
          score: cosineSimilarity(queryEmbedding, record.embedding),
          matchedTerms: Object.keys(queryEmbedding.terms).filter((term) => term in record.embedding.terms),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    all(): VectorStoreRecord[] {
      return [...records];
    },
  };
}
