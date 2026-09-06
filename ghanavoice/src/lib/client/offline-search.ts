'use client';
import type { OfflinePack, OfflinePackManifest } from '@/lib/offline/packs';
import { normalizeForMatch } from '@/lib/ai/providers/embeddings/hash-local';
import type { AskResult } from '@/lib/rag/answer';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

export const PACK_CACHE = 'gv-packs-v1';

export async function listDownloadedPacks(): Promise<OfflinePack[]> {
  if (typeof caches === 'undefined') return [];
  const cache = await caches.open(PACK_CACHE);
  const keys = await cache.keys();
  const packs: OfflinePack[] = [];
  for (const k of keys) {
    const res = await cache.match(k);
    if (res) packs.push((await res.json()) as OfflinePack);
  }
  return packs;
}

export async function downloadPack(manifest: OfflinePackManifest): Promise<OfflinePack> {
  const res = await fetch(`/api/packs/${manifest.id}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const pack = (await res.json()) as OfflinePack;
  const cache = await caches.open(PACK_CACHE);
  await cache.put(`/api/packs/${manifest.id}`, new Response(JSON.stringify(pack), { headers: { 'content-type': 'application/json' } }));
  return pack;
}

export async function removePack(id: string) {
  const cache = await caches.open(PACK_CACHE);
  await cache.delete(`/api/packs/${id}`);
}

/**
 * Lexical search over downloaded packs (no network, no model). Same
 * normalisation as the server so that behaviour is consistent offline.
 */
export function searchPacks(packs: OfflinePack[], question: string, language: LanguageCode): AskResult {
  const qTokens = new Set(normalizeForMatch(question).split(' ').filter((tok) => tok.length > 1));
  let best: { score: number; pack: OfflinePack; entry: OfflinePack['entries'][number] } | null = null;
  for (const pack of packs) {
    for (const entry of pack.entries) {
      const r = entry.rendering;
      const text = normalizeForMatch(`${r.title} ${r.summary} ${r.keywords.join(' ')} ${r.keywords.join(' ')} ${r.body}`);
      const tokens = text.split(' ');
      let overlap = 0;
      for (const tok of qTokens) if (tokens.includes(tok)) overlap++;
      const score = qTokens.size ? overlap / qTokens.size : 0;
      const langBonus = pack.language === language ? 1 : 0.9;
      if (!best || score * langBonus > best.score) best = { score: score * langBonus, pack, entry };
    }
  }
  const status = { status: LANGUAGES[language].defaultStatus, description: 'Offline pack; support for this language is experimental' as string };
  if (!best || best.score < 0.25) {
    return {
      kind: 'not_certain',
      language,
      answerLanguage: language,
      text: t(language, 'answer.notCertain'),
      citations: [],
      confidence: { level: 'low', score: 0, factors: { retrievalTop: 0, retrievalMargin: 0, languageFallback: false, nativeReviewed: false, stale: false, languageStatus: status.status }, notes: ['Offline: only downloaded packs were searched.'] },
      safety: { category: 'none', emergencyNumbers: false },
      healthDisclaimer: false,
      provider: { retrieval: 'offline-lexical', answerer: 'none' },
      languageStatus: status,
      trace: { passages: [], safetyMatched: [], fellBackToExtractive: false },
    };
  }
  const e = best.entry;
  const score = Math.round(Math.min(1, best.score) * 100) / 100;
  return {
    kind: 'answer',
    domain: e.domain as AskResult['domain'],
    language,
    answerLanguage: e.rendering.language,
    title: e.rendering.title,
    text: e.rendering.summary,
    citations: [
      {
        entryId: e.id,
        title: e.rendering.title,
        sources: e.sources.map((s) => ({ ...s, rights: '' })),
        updatedOn: e.updatedOn,
        reviewBy: e.reviewBy,
        renderingLanguage: e.rendering.language,
        nativeReviewed: e.rendering.nativeReviewed,
      },
    ],
    confidence: {
      level: score >= 0.6 ? 'medium' : 'low',
      score,
      factors: { retrievalTop: score, retrievalMargin: 0, languageFallback: e.rendering.language !== language, nativeReviewed: e.rendering.nativeReviewed, stale: false, languageStatus: status.status },
      notes: ['Offline: answered from a downloaded pack using keyword matching only.'],
    },
    safety: { category: e.healthGeneralInfoOnly ? 'health_general' : 'none', emergencyNumbers: false },
    healthDisclaimer: e.healthGeneralInfoOnly,
    escalation: e.escalation,
    provider: { retrieval: 'offline-lexical', answerer: 'extractive-offline' },
    languageStatus: status,
    trace: { passages: [{ entryId: e.id, language: e.rendering.language, score }], safetyMatched: [], fellBackToExtractive: false },
  };
}
