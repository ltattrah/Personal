import type { EmbeddingProvider } from '@/lib/ai/types';

/**
 * Dependency-free "embedding" built from hashed character n-grams. It is NOT a
 * semantic embedding; it behaves like a fuzzy lexical fingerprint that is
 * tolerant to spelling variation (useful across Asante/Akuapem orthography
 * differences and to noisy ASR output). It runs on the server, in tests, and
 * inside the service worker for offline packs. Replace with a real model via
 * EMBEDDING_PROVIDER=openai|http for semantic recall.
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hash-ngram-v1';
  readonly dimensions: number;
  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
  embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const norm = normalizeForMatch(text);
    for (const token of norm.split(' ')) {
      if (!token) continue;
      const padded = ` ${token} `;
      for (let n = 3; n <= 4; n++) {
        for (let i = 0; i + n <= padded.length; i++) {
          const gram = padded.slice(i, i + n);
          const h = fnv1a(gram);
          vec[h % this.dimensions] += 1;
          // second hash to reduce collisions
          vec[(h >>> 7) % this.dimensions] += 0.5;
        }
      }
    }
    const len = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    return vec.map((x) => x / len);
  }
}

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Normalise text for matching across orthographies: lower-case, fold the
 * special Ghanaian-language letters to ASCII look-alikes so that a user typing
 * "e" for "ɛ" or "o" for "ɔ" (very common on phone keyboards) still matches,
 * and strip punctuation.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ɛ]/g, 'e')
    .replace(/[ɔ]/g, 'o')
    .replace(/[ɖ]/g, 'd')
    .replace(/[ƒ]/g, 'f')
    .replace(/[ɣ]/g, 'g')
    .replace(/[ŋ]/g, 'n')
    .replace(/[ʋ]/g, 'v')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9#*+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Light plural folding for English-style tokens ("worms" -> "worm",
    // "vaccines" -> "vaccine"). Applied identically to documents and queries.
    // Ghanaian-language words almost never end in -s, so the effect there is nil.
    .replace(/\b([a-z]{4,})s\b/g, '$1');
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot; // inputs are unit vectors
}
