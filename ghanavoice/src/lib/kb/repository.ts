import type { GlossaryTerm, KnowledgeEntry, ReviewStatus } from './types';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Storage-agnostic access to curated content.
 *   - InMemoryRepository reads the JSON in /content (demo mode, tests, offline packs build)
 *   - SupabaseRepository reads the same shape from PostgreSQL (full mode)
 */
export interface KnowledgeRepository {
  listEntries(filter?: { status?: ReviewStatus[]; domain?: string; language?: LanguageCode }): Promise<KnowledgeEntry[]>;
  getEntry(id: string): Promise<KnowledgeEntry | null>;
  upsertEntry(entry: KnowledgeEntry): Promise<void>;
  setStatus(id: string, status: ReviewStatus, actor: string, note?: string): Promise<void>;
  listGlossary(): Promise<GlossaryTerm[]>;
  upsertGlossaryTerm(term: GlossaryTerm): Promise<void>;
}

export class InMemoryRepository implements KnowledgeRepository {
  private entries = new Map<string, KnowledgeEntry>();
  private glossary = new Map<string, GlossaryTerm>();
  public readonly audit: { id: string; status: ReviewStatus; actor: string; note?: string; at: string }[] = [];

  constructor(entries: KnowledgeEntry[] = [], glossary: GlossaryTerm[] = []) {
    entries.forEach((e) => this.entries.set(e.id, e));
    glossary.forEach((g) => this.glossary.set(g.id, g));
  }

  async listEntries(filter?: { status?: ReviewStatus[]; domain?: string; language?: LanguageCode }) {
    let out = [...this.entries.values()];
    if (filter?.status) out = out.filter((e) => filter.status!.includes(e.status));
    if (filter?.domain) out = out.filter((e) => e.domain === filter.domain);
    if (filter?.language) out = out.filter((e) => e.renderings.some((r) => r.language === filter.language));
    return out;
  }
  async getEntry(id: string) {
    return this.entries.get(id) ?? null;
  }
  async upsertEntry(entry: KnowledgeEntry) {
    this.entries.set(entry.id, entry);
  }
  async setStatus(id: string, status: ReviewStatus, actor: string, note?: string) {
    const e = this.entries.get(id);
    if (!e) throw new Error(`Entry ${id} not found`);
    e.status = status;
    this.audit.push({ id, status, actor, note, at: new Date().toISOString() });
  }
  async listGlossary() {
    return [...this.glossary.values()];
  }
  async upsertGlossaryTerm(term: GlossaryTerm) {
    this.glossary.set(term.id, term);
  }
}
