import { loadBundledEntries, loadBundledGlossary } from '@content/kb/index';
import { RetrievalIndex } from '@/lib/rag/retrieve';
import { buildServices } from '@/lib/ai/registry';

export const entries = loadBundledEntries();
export const glossary = loadBundledGlossary();
export const services = buildServices({});

let indexPromise: Promise<RetrievalIndex> | null = null;
export function getIndex() {
  if (!indexPromise) indexPromise = RetrievalIndex.build(entries, services.embeddings);
  return indexPromise;
}
