import type { EmbeddingProvider } from '@/lib/ai/types';
import type { KnowledgeEntry, KnowledgeRendering, RetrievedPassage } from '@/lib/kb/types';
import { fallbackChain, type LanguageCode } from '@/lib/i18n/languages';
import { cosine, normalizeForMatch } from '@/lib/ai/providers/embeddings/hash-local';

/**
 * Hybrid retrieval over published entries.
 *
 *  - Lexical: BM25-style scoring over normalised tokens of title, summary,
 *    body and keywords, with keywords weighted higher. Orthography folding
 *    (ɛ->e, ɔ->o) makes phone-keyboard spellings match.
 *  - Vector: cosine similarity between the query embedding and each
 *    rendering's embedding (pre-computed in Supabase via pgvector in full
 *    mode; computed on the fly from the bundled content in demo mode).
 *  - Fusion: weighted sum after min-max normalisation, then language
 *    preference: exact variety > sister variety > English, each step
 *    marked as a fallback so the UI can say so.
 */

export interface RetrieveOptions {
  language: LanguageCode;
  topK?: number;
  /** 0..1 weight of the vector score in fusion */
  vectorWeight?: number;
  /** Restrict to a domain (used by organisation-specific assistants) */
  domain?: string;
}

export interface IndexedRendering {
  entry: KnowledgeEntry;
  rendering: KnowledgeRendering;
  /** Unweighted token count (for length normalisation) */
  length: number;
  /** Field-weighted term frequencies: title x3, keywords x3, summary x2, body x1 */
  tf: Map<string, number>;
  embedding: number[];
}

/**
 * High-frequency function words that carry no topical signal. Kept short and
 * explicit; Ghanaian-language entries are drafts (docs/07). Stored in the
 * normalised (ɛ->e, ɔ->o) form that normalizeForMatch produces.
 */
const STOPWORDS = new Set([
  'how', 'do', 'i', 'the', 'a', 'an', 'is', 'are', 'for', 'to', 'of', 'my', 'me', 'what', 'where', 'when', 'can', 'and', 'in', 'on', 'it', 'this', 'that', 'we', 'you', 'be', 'with', 'or', 'please', 'want',
  'get', 'go', 'know', 'tell', 'give', 'make', 'need', 'about', 'should', 'does', 'did', 'was', 'am', 'have', 'has', 'at', 'by', 'from', 'if', 'who', 'which', 'there',
  // Akan
  'na', 'se', 'ne', 'no', 'mu', 'so', 'wo', 'ho', 'den', 'sen', 'ben', 'ye', 'meye', 'wu',
  // Ewe
  'nye', 'le', 'la', 'de', 'be', 'kple', 'nu', 'aleke',
  // Ga
  'mi', 'bo', 'ni', 'ke', 'ko', 'nɛgbɛ', 'negbe', 'meni', 'te', 'nɔ',
]);

export class RetrievalIndex {
  private docs: IndexedRendering[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(private readonly embeddings: EmbeddingProvider) {}

  static async build(entries: KnowledgeEntry[], embeddings: EmbeddingProvider): Promise<RetrievalIndex> {
    const idx = new RetrievalIndex(embeddings);
    const published = entries.filter((e) => e.status === 'published');
    const texts: string[] = [];
    const pairs: { entry: KnowledgeEntry; rendering: KnowledgeRendering }[] = [];
    for (const entry of published) {
      for (const rendering of entry.renderings) {
        pairs.push({ entry, rendering });
        texts.push(renderingText(rendering));
      }
    }
    const vecs = texts.length ? await embeddings.embed(texts) : [];
    pairs.forEach(({ entry, rendering }, i) => {
      const { tf, length } = weightedTermFrequencies(rendering);
      idx.docs.push({ entry, rendering, length, tf, embedding: vecs[i] });
      for (const t of tf.keys()) idx.df.set(t, (idx.df.get(t) ?? 0) + 1);
    });
    idx.avgLen = idx.docs.reduce((a, d) => a + d.length, 0) / Math.max(1, idx.docs.length);
    return idx;
  }

  size() {
    return this.docs.length;
  }

  async search(query: string, opts: RetrieveOptions): Promise<RetrievedPassage[]> {
    const topK = opts.topK ?? 5;
    const vectorWeight = opts.vectorWeight ?? 0.3;
    const { unigrams: allTokens, bigrams: qBigrams } = termsOf(query);
    const content = allTokens.filter((t) => !STOPWORDS.has(t));
    // If the whole query is stopwords, fall back to using them all.
    const qTokens = content.length ? content : allTokens;
    const qNorm = normalizeForMatch(query);
    const [qVec] = qTokens.length ? await this.embeddings.embed([query]) : [[]];
    const N = this.docs.length;
    const k1 = 1.5;
    const b = 0.75;
    const idfOf = (t: string) => {
      const df = this.df.get(t) ?? 0;
      return Math.log(1 + (N - df + 0.5) / (df + 0.5));
    };
    // Maximum achievable BM25 for this query: every token matched with saturated tf.
    // Unknown tokens count with the idf of an unseen term so that junk queries score low.
    const maxAchievable =
      qTokens.reduce((a, t) => a + idfOf(t) * (k1 + 1), 0) + qBigrams.reduce((a, t) => a + BIGRAM_WEIGHT * idfOf(t) * (k1 + 1), 0) || 1;

    const chain = fallbackChain(opts.language);
    const candidates = this.docs
      .filter((d) => (opts.domain ? d.entry.domain === opts.domain : true))
      .filter((d) => chain.includes(d.rendering.language));

    const scored = candidates.map((d) => {
      let lexical = 0;
      const bm25 = (t: string) => {
        const f = d.tf.get(t) ?? 0;
        return f ? idfOf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / this.avgLen))) : 0;
      };
      for (const t of qTokens) lexical += bm25(t);
      for (const t of qBigrams) lexical += BIGRAM_WEIGHT * bm25(t);
      // Curated multi-word keywords are editor-chosen retrieval hooks: an exact
      // phrase hit is strong evidence, so add a bounded bonus.
      const phraseHits = d.rendering.keywords.filter((k) => k.includes(' ') && qNorm.includes(normalizeForMatch(k))).length;
      const phraseBonus = Math.min(0.3, phraseHits * 0.15);
      const vector = qVec.length ? Math.max(0, cosine(qVec, d.embedding)) : 0;
      return { d, lexical, phraseBonus, vector };
    });

    const fused: RetrievedPassage[] = scored.map(({ d, lexical, phraseBonus, vector }) => {
      // Both components are absolute (0..1), not relative to the best hit, so a
      // query that matches nothing well produces a low score and triggers abstention.
      const lex = Math.min(1, lexical / maxAchievable + phraseBonus);
      const vec = vector;
      const base = (1 - vectorWeight) * lex + vectorWeight * vec;
      // Prefer the exact variety; degrade sister varieties slightly and English more.
      const rank = chain.indexOf(d.rendering.language);
      const languagePenalty = rank === 0 ? 1 : rank === chain.length - 1 && d.rendering.language !== opts.language ? 0.85 : 0.93;
      return {
        entry: d.entry,
        rendering: d.rendering,
        score: round(base * languagePenalty),
        lexicalScore: round(lex),
        vectorScore: round(vec),
        languageFallback: d.rendering.language !== opts.language,
      };
    });

    // Keep at most one rendering per entry (the best-scoring language).
    const byEntry = new Map<string, RetrievedPassage>();
    for (const p of fused.sort((a, b) => b.score - a.score)) {
      if (!byEntry.has(p.entry.id)) byEntry.set(p.entry.id, p);
    }
    return [...byEntry.values()].filter((p) => p.score > 0).slice(0, topK);
  }
}

export function renderingText(r: KnowledgeRendering) {
  return `${r.title}. ${r.summary} ${r.keywords.join(' ')}`;
}

/** Unigrams plus bigrams of consecutive content words ("ghana card" -> "ghana_card"). */
export function termsOf(text: string): { unigrams: string[]; bigrams: string[] } {
  const unigrams = normalizeForMatch(text).split(' ').filter(Boolean);
  const content = unigrams.filter((t) => !STOPWORDS.has(t));
  const bigrams: string[] = [];
  for (let i = 0; i + 1 < content.length; i++) bigrams.push(`${content[i]}_${content[i + 1]}`);
  return { unigrams, bigrams };
}

const BIGRAM_WEIGHT = 0.5;

function weightedTermFrequencies(r: KnowledgeRendering): { tf: Map<string, number>; length: number } {
  const tf = new Map<string, number>();
  let length = 0;
  const add = (text: string, weight: number) => {
    const { unigrams, bigrams } = termsOf(text);
    for (const tok of unigrams) {
      length += 1;
      tf.set(tok, (tf.get(tok) ?? 0) + weight);
    }
    for (const bg of bigrams) tf.set(bg, (tf.get(bg) ?? 0) + weight);
  };
  add(r.title, 3);
  add(r.keywords.join(' '), 3);
  add(r.summary, 2);
  add(r.body, 1);
  return { tf, length };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
