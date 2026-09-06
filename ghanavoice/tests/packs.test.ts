import { describe, expect, it } from 'vitest';
import { buildManifests, buildPack } from '@/lib/offline/packs';
import { entries } from './helpers';

describe('offline packs', () => {
  it('builds small packs with fallback renderings and no admin fields', () => {
    const pack = buildPack(entries, 'agriculture', 'ee');
    expect(pack.entryCount).toBeGreaterThan(0);
    expect(pack.approxBytes).toBeLessThan(60 * 1024);
    const withEwe = pack.entries.find((e) => e.id === 'fall-armyworm-management');
    expect(withEwe?.rendering.language).toBe('ee');
    const fallback = pack.entries.find((e) => e.id === 'extension-services');
    expect(fallback?.rendering.language).toBe('en');
    expect(JSON.stringify(pack)).not.toContain('"status"');
  });
  it('produces manifests for every domain and language with content', () => {
    const m = buildManifests(entries, ['en', 'ak-asante', 'ak-akuapem', 'ee', 'gaa']);
    expect(m.length).toBe(20);
    expect(m.every((x) => x.contentUpdatedOn.match(/^\d{4}/))).toBe(true);
  });
});
