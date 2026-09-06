import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeRepository } from '@/lib/kb/repository';
import type { GlossaryTerm, KnowledgeEntry, KnowledgeRendering, ReviewStatus, Source } from '@/lib/kb/types';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * PostgreSQL-backed repository. Table shapes are defined in
 * supabase/migrations/0001_init.sql. Renderings are separate rows so each
 * language variety has its own review state.
 */
export class SupabaseRepository implements KnowledgeRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listEntries(filter?: { status?: ReviewStatus[]; domain?: string; language?: LanguageCode }): Promise<KnowledgeEntry[]> {
    let q = this.db.from('kb_entries').select('*, kb_sources(*), kb_renderings(*)');
    if (filter?.status) q = q.in('status', filter.status);
    if (filter?.domain) q = q.eq('domain', filter.domain);
    const { data, error } = await q;
    if (error) throw error;
    const entries = (data ?? []).map(rowToEntry);
    return filter?.language ? entries.filter((e) => e.renderings.some((r) => r.language === filter.language)) : entries;
  }

  async getEntry(id: string) {
    const { data, error } = await this.db.from('kb_entries').select('*, kb_sources(*), kb_renderings(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToEntry(data) : null;
  }

  async upsertEntry(entry: KnowledgeEntry) {
    const { error } = await this.db.from('kb_entries').upsert({
      id: entry.id,
      domain: entry.domain,
      topic: entry.topic,
      health_general_info_only: entry.healthGeneralInfoOnly ?? false,
      updated_on: entry.updatedOn,
      review_by: entry.reviewBy,
      status: entry.status,
      regions: entry.regions,
      escalation: entry.escalation ?? null,
    });
    if (error) throw error;
    await this.db.from('kb_sources').delete().eq('entry_id', entry.id);
    const { error: sErr } = await this.db.from('kb_sources').insert(
      entry.sources.map((s) => ({ entry_id: entry.id, title: s.title, publisher: s.publisher, url: s.url ?? null, published_on: s.publishedOn ?? null, verified_on: s.verifiedOn, rights: s.rights })),
    );
    if (sErr) throw sErr;
    const { error: rErr } = await this.db.from('kb_renderings').upsert(
      entry.renderings.map((r) => ({
        entry_id: entry.id,
        language: r.language,
        title: r.title,
        summary: r.summary,
        body: r.body,
        keywords: r.keywords,
        origin: r.origin,
        native_reviewed: r.nativeReviewed,
        reviewed_on: r.reviewedOn ?? null,
        reviewed_by: r.reviewedBy ?? null,
      })),
      { onConflict: 'entry_id,language' },
    );
    if (rErr) throw rErr;
  }

  async setStatus(id: string, status: ReviewStatus, actor: string, note?: string) {
    const { error } = await this.db.rpc('kb_set_status', { p_entry_id: id, p_status: status, p_actor: actor, p_note: note ?? null });
    if (error) throw error;
  }

  async listGlossary(): Promise<GlossaryTerm[]> {
    const { data, error } = await this.db.from('glossary_terms').select('*, glossary_renderings(*)');
    if (error) throw error;
    return (data ?? []).map((row: GlossaryRow) => ({
      id: row.id,
      concept: row.concept,
      domain: row.domain,
      en: row.en,
      updatedOn: row.updated_on,
      avoid: row.avoid ?? undefined,
      renderings: Object.fromEntries(row.glossary_renderings.map((r) => [r.language, { term: r.term, note: r.note ?? undefined, approved: r.approved }])),
    }));
  }

  async upsertGlossaryTerm(term: GlossaryTerm) {
    const { error } = await this.db.from('glossary_terms').upsert({ id: term.id, concept: term.concept, domain: term.domain, en: term.en, avoid: term.avoid ?? null, updated_on: term.updatedOn });
    if (error) throw error;
    const rows = Object.entries(term.renderings).map(([language, r]) => ({ term_id: term.id, language, term: r!.term, note: r!.note ?? null, approved: r!.approved }));
    const { error: rErr } = await this.db.from('glossary_renderings').upsert(rows, { onConflict: 'term_id,language' });
    if (rErr) throw rErr;
  }
}

interface EntryRow {
  id: string;
  domain: KnowledgeEntry['domain'];
  topic: string;
  health_general_info_only: boolean;
  updated_on: string;
  review_by: string;
  status: ReviewStatus;
  regions: string[];
  escalation: KnowledgeEntry['escalation'] | null;
  kb_sources: { title: string; publisher: string; url: string | null; published_on: string | null; verified_on: string; rights: string }[];
  kb_renderings: {
    language: LanguageCode;
    title: string;
    summary: string;
    body: string;
    keywords: string[];
    origin: KnowledgeRendering['origin'];
    native_reviewed: boolean;
    reviewed_on: string | null;
    reviewed_by: string | null;
  }[];
}

interface GlossaryRow {
  id: string;
  concept: string;
  domain: GlossaryTerm['domain'];
  en: string;
  avoid: GlossaryTerm['avoid'] | null;
  updated_on: string;
  glossary_renderings: { language: string; term: string; note: string | null; approved: boolean }[];
}

function rowToEntry(row: EntryRow): KnowledgeEntry {
  return {
    id: row.id,
    domain: row.domain,
    topic: row.topic,
    healthGeneralInfoOnly: row.health_general_info_only || undefined,
    updatedOn: row.updated_on,
    reviewBy: row.review_by,
    status: row.status,
    regions: row.regions ?? [],
    escalation: row.escalation ?? undefined,
    sources: row.kb_sources.map(
      (s): Source => ({ title: s.title, publisher: s.publisher, url: s.url ?? undefined, publishedOn: s.published_on ?? undefined, verifiedOn: s.verified_on, rights: s.rights }),
    ),
    renderings: row.kb_renderings.map(
      (r): KnowledgeRendering => ({
        language: r.language,
        title: r.title,
        summary: r.summary,
        body: r.body,
        keywords: r.keywords ?? [],
        origin: r.origin,
        nativeReviewed: r.native_reviewed,
        reviewedOn: r.reviewed_on ?? undefined,
        reviewedBy: r.reviewed_by ?? undefined,
      }),
    ),
  };
}
