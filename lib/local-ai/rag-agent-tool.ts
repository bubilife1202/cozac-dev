import type { LocalDocument, RetrievalMatch } from "./types";
import { chunkDocument } from "./chunking";
import { retrieveLexicalChunks } from "./retrieval";

export function retrieveFromLocalDocuments(
  query: string,
  documents: LocalDocument[],
  limit = 5,
): RetrievalMatch[] {
  const chunks = documents.flatMap((document) => chunkDocument(document));
  return retrieveLexicalChunks(query, chunks, limit);
}

export function formatRetrievalCitations(matches: RetrievalMatch[]): string[] {
  return matches.map(
    (match, index) =>
      `citation #${index + 1}: ${match.chunk.path} [chunk ${match.chunk.chunkIndex + 1}] score ${match.score.toFixed(2)}`,
  );
}
