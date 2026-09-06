import { describe, expect, it } from 'vitest';
import { computeConfidence } from '@/lib/rag/confidence';
import type { RetrievedPassage } from '@/lib/kb/types';
import { entries } from './helpers';

function passage(score: number, overrides: Partial<RetrievedPassage> = {}): RetrievedPassage {
  const entry = entries[0];
  return { entry, rendering: entry.renderings[0], score, lexicalScore: score, vectorScore: score, languageFallback: false, ...overrides };
}

describe('confidence', () => {
  it('is low with no passages', () => {
    const c = computeConfidence([], { languageStatus: 'experimental' });
    expect(c.level).toBe('low');
    expect(c.score).toBe(0);
  });
  it('is high for a strong, unambiguous English match on evaluated content', () => {
    const c = computeConfidence([passage(1), passage(0.3)], { languageStatus: 'evaluated', today: new Date('2026-09-05') });
    expect(c.level).toBe('high');
  });
  it('penalises language fallback, unreviewed translations and low STT confidence', () => {
    const base = computeConfidence([passage(1), passage(0.3)], { languageStatus: 'evaluated', today: new Date('2026-09-05') });
    const twi = entries.find((e) => e.id === 'emergency-numbers')!;
    const r = twi.renderings.find((x) => x.language === 'ak-asante')!;
    const worse = computeConfidence([{ entry: twi, rendering: r, score: 1, lexicalScore: 1, vectorScore: 1, languageFallback: true }, passage(0.3)], { languageStatus: 'experimental', sttConfidence: 0.3, today: new Date('2026-09-05') });
    expect(worse.score).toBeLessThan(base.score);
    expect(worse.notes.length).toBeGreaterThanOrEqual(3);
  });
  it('flags stale content past its review date', () => {
    const c = computeConfidence([passage(1)], { languageStatus: 'evaluated', today: new Date('2030-01-01') });
    expect(c.factors.stale).toBe(true);
    expect(c.notes.join(' ')).toMatch(/re-verification/);
  });
});
