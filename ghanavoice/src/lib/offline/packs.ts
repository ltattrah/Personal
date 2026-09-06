import type { KnowledgeEntry } from '@/lib/kb/types';
import { fallbackChain, type LanguageCode } from '@/lib/i18n/languages';

/**
 * Offline information packs are small JSON bundles of published entries for one
 * domain and one language (with English fallback renderings), sized for 2G/3G.
 * The service worker stores them in the Cache Storage API; the client-side
 * search uses the same lexical matcher as the server (no network needed).
 */
export interface OfflinePackManifest {
  id: string;
  domain: string;
  language: LanguageCode;
  title: string;
  entryCount: number;
  approxBytes: number;
  builtAt: string;
  /** Latest updatedOn among included entries */
  contentUpdatedOn: string;
}

export interface OfflinePack extends OfflinePackManifest {
  entries: {
    id: string;
    topic: string;
    domain: string;
    updatedOn: string;
    reviewBy: string;
    healthGeneralInfoOnly: boolean;
    sources: { title: string; publisher: string; url?: string; verifiedOn: string }[];
    escalation?: { label: string; phone?: string; url?: string };
    rendering: { language: LanguageCode; title: string; summary: string; body: string; keywords: string[]; nativeReviewed: boolean };
  }[];
}

export const PACK_DOMAINS = ['public-service', 'education', 'agriculture', 'health'] as const;

export function packId(domain: string, language: LanguageCode) {
  return `${domain}--${language}`;
}

export function buildPack(entries: KnowledgeEntry[], domain: string, language: LanguageCode, builtAt = new Date().toISOString()): OfflinePack {
  const chain = fallbackChain(language);
  const included = entries
    .filter((e) => e.status === 'published' && e.domain === domain)
    .map((e) => {
      const rendering = chain.map((l) => e.renderings.find((r) => r.language === l)).find(Boolean);
      if (!rendering) return null;
      return {
        id: e.id,
        topic: e.topic,
        domain: e.domain,
        updatedOn: e.updatedOn,
        reviewBy: e.reviewBy,
        healthGeneralInfoOnly: Boolean(e.healthGeneralInfoOnly),
        sources: e.sources.map((s) => ({ title: s.title, publisher: s.publisher, url: s.url, verifiedOn: s.verifiedOn })),
        escalation: e.escalation,
        rendering: {
          language: rendering.language,
          title: rendering.title,
          summary: rendering.summary,
          body: rendering.body,
          keywords: rendering.keywords,
          nativeReviewed: rendering.nativeReviewed,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const base = {
    id: packId(domain, language),
    domain,
    language,
    title: `${domainTitle(domain)} (${language})`,
    entryCount: included.length,
    builtAt,
    contentUpdatedOn: included.reduce((m, e) => (e.updatedOn > m ? e.updatedOn : m), '0000-00-00'),
  };
  const pack: OfflinePack = { ...base, approxBytes: 0, entries: included };
  pack.approxBytes = Buffer.byteLength(JSON.stringify(pack), 'utf8');
  return pack;
}

export function buildManifests(entries: KnowledgeEntry[], languages: LanguageCode[], builtAt?: string): OfflinePackManifest[] {
  const out: OfflinePackManifest[] = [];
  for (const d of PACK_DOMAINS) {
    for (const l of languages) {
      const { entries: _e, ...manifest } = buildPack(entries, d, l, builtAt);
      void _e;
      if (manifest.entryCount > 0) out.push(manifest);
    }
  }
  return out;
}

export function domainTitle(domain: string) {
  return (
    { 'public-service': 'Public services', education: 'Education', agriculture: 'Agriculture', health: 'Health (general information)' } as Record<string, string>
  )[domain] ?? domain;
}
