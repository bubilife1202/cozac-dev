export type LexicalEmbedding = {
  terms: Record<string, number>;
  magnitude: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣_]+/)
    .filter((term) => term.length >= 2);
}

export function createLexicalEmbedding(text: string): LexicalEmbedding {
  const terms: Record<string, number> = {};
  for (const term of tokenize(text)) {
    terms[term] = (terms[term] ?? 0) + 1;
  }

  const magnitude = Math.sqrt(Object.values(terms).reduce((sum, value) => sum + value * value, 0));
  return { terms, magnitude };
}

export function cosineSimilarity(a: LexicalEmbedding, b: LexicalEmbedding): number {
  if (a.magnitude === 0 || b.magnitude === 0) {
    return 0;
  }

  const dot = Object.entries(a.terms).reduce((sum, [term, value]) => sum + value * (b.terms[term] ?? 0), 0);
  return dot / (a.magnitude * b.magnitude);
}
