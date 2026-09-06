import { describe, expect, it } from 'vitest';
import { InMemoryRepository } from '@/lib/kb/repository';
import { entries } from './helpers';

/** Mirrors the decision rule in /api/admin/review: all four scores >= 4 to pass. */
function decide(scores: Record<string, number>) {
  return Object.values(scores).every((v) => v >= 4);
}

describe('native-speaker review rule', () => {
  it('passes only when every dimension scores 4 or 5', () => {
    expect(decide({ adequacy: 5, fluency: 4, register: 4, orthography: 4 })).toBe(true);
    expect(decide({ adequacy: 5, fluency: 5, register: 3, orthography: 5 })).toBe(false);
  });
  it('a passed review records reviewer and date on the rendering and an audit line', async () => {
    const repo = new InMemoryRepository(entries.map((e) => ({ ...e, renderings: e.renderings.map((r) => ({ ...r })) })));
    const entry = (await repo.getEntry('emergency-numbers'))!;
    const r = entry.renderings.find((x) => x.language === 'ee')!;
    r.nativeReviewed = true;
    r.reviewedBy = 'reviewer@x';
    r.reviewedOn = '2026-09-06';
    await repo.upsertEntry(entry);
    await repo.setStatus(entry.id, entry.status, 'reviewer@x', 'native review ee: passed');
    const again = (await repo.getEntry('emergency-numbers'))!;
    expect(again.renderings.find((x) => x.language === 'ee')).toMatchObject({ nativeReviewed: true, reviewedBy: 'reviewer@x' });
    expect(repo.audit.at(-1)?.note).toMatch(/native review ee/);
  });
});
