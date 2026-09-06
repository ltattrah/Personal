import { getServices } from '@/lib/ai/registry';
import { RetrievalIndex } from './retrieve';
import { getRepository } from '@/lib/db/repository-factory';
import type { GlossaryTerm } from '@/lib/kb/types';

/**
 * Process-wide lazily built retrieval index. In full mode the Supabase
 * repository supplies entries; embeddings are still computed by the configured
 * provider at index build time (the pgvector column is used by the SQL
 * `match_renderings` function for very large corpora, see supabase/migrations).
 * The index is rebuilt when content is published (see admin/content route).
 */
let indexPromise: Promise<{ index: RetrievalIndex; glossary: GlossaryTerm[]; builtAt: string }> | null = null;

export function getPipeline() {
  if (!indexPromise) indexPromise = build();
  return indexPromise;
}

export function invalidatePipeline() {
  indexPromise = null;
}

async function build() {
  const repo = await getRepository();
  const services = getServices();
  const [entries, glossary] = await Promise.all([repo.listEntries({ status: ['published'] }), repo.listGlossary()]);
  const index = await RetrievalIndex.build(entries, services.embeddings);
  return { index, glossary, builtAt: new Date().toISOString() };
}
