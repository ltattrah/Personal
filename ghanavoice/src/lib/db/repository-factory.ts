import { InMemoryRepository, type KnowledgeRepository } from '@/lib/kb/repository';
import { loadBundledEntries, loadBundledGlossary } from '@content/kb/index';
import { isFullMode } from './supabase';

let repo: KnowledgeRepository | null = null;

export async function getRepository(): Promise<KnowledgeRepository> {
  if (repo) return repo;
  if (isFullMode()) {
    const { SupabaseRepository } = await import('./supabase-repository');
    const { getServiceClient } = await import('./supabase');
    repo = new SupabaseRepository(getServiceClient());
  } else {
    repo = new InMemoryRepository(loadBundledEntries(), loadBundledGlossary());
  }
  return repo;
}

/** Test helper */
export function setRepositoryForTests(r: KnowledgeRepository | null) {
  repo = r;
}
