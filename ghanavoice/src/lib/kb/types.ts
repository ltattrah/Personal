import type { LanguageCode } from '@/lib/i18n/languages';

export type Domain = 'public-service' | 'education' | 'agriculture' | 'health';

export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'retired';

export interface Source {
  title: string;
  /** Publishing body, e.g. "Ghana Health Service" */
  publisher: string;
  url?: string;
  /** ISO date the source document was published or last revised */
  publishedOn?: string;
  /** ISO date GhanaVoice editors last verified the source */
  verifiedOn: string;
  /** Rights statement for the excerpt used, e.g. "Public domain (Government of Ghana publication)" */
  rights: string;
}

/**
 * One entry = one canonical fact/answer unit. Each entry has one or more
 * language renderings. Renderings are separate rows in the database so that
 * Asante and Akuapem Twi can be stored, reviewed and evaluated independently.
 */
export interface KnowledgeRendering {
  language: LanguageCode;
  title: string;
  /** Short answer (1-3 sentences) suitable for speech */
  summary: string;
  /** Longer body, plain text; may include simple newlines */
  body: string;
  /** Keywords/synonyms to help lexical retrieval in this language */
  keywords: string[];
  /** Who produced the text: 'source' (official text in this language), 'editor', 'machine' (MT draft) */
  origin: 'source' | 'editor' | 'machine';
  /** Whether a qualified native speaker reviewed this rendering */
  nativeReviewed: boolean;
  reviewedOn?: string;
  reviewedBy?: string;
}

export interface KnowledgeEntry {
  id: string;
  domain: Domain;
  /** Topic path used for offline packs and navigation, e.g. "public-service/ghana-card" */
  topic: string;
  /** Health entries must be true; enforces general-information-only handling */
  healthGeneralInfoOnly?: boolean;
  /** ISO date this entry's content was last changed */
  updatedOn: string;
  /** Date after which the entry should be re-verified; the UI shows a stale warning past it */
  reviewBy: string;
  status: ReviewStatus;
  /** Regions where the entry applies; empty = nationwide */
  regions: string[];
  sources: Source[];
  renderings: KnowledgeRendering[];
  /** Optional escalation contact (phone/URL) for humans */
  escalation?: { label: string; phone?: string; url?: string };
}

export interface Chunk {
  id: string;
  entryId: string;
  language: LanguageCode;
  text: string;
  embedding?: number[];
}

export interface RetrievedPassage {
  entry: KnowledgeEntry;
  rendering: KnowledgeRendering;
  /** 0..1 fused score */
  score: number;
  lexicalScore: number;
  vectorScore: number;
  /** True when the rendering language differs from the requested one */
  languageFallback: boolean;
}

export interface GlossaryTerm {
  id: string;
  /** Concept key, e.g. "ghana-card" */
  concept: string;
  domain: Domain | 'general';
  en: string;
  renderings: Partial<Record<Exclude<LanguageCode, 'en'>, { term: string; note?: string; approved: boolean }>>;
  /** Terms that must NOT be used (e.g. offensive or archaic), per language */
  avoid?: Partial<Record<LanguageCode, string[]>>;
  updatedOn: string;
}
