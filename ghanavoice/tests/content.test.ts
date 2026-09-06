import { describe, expect, it } from 'vitest';
import { entries, glossary } from './helpers';

describe('bundled content', () => {
  it('parses and validates every entry', () => {
    expect(entries.length).toBeGreaterThanOrEqual(18);
  });
  it('every entry has at least one source with a verification date and rights', () => {
    for (const e of entries) {
      expect(e.sources.length).toBeGreaterThan(0);
      for (const s of e.sources) {
        expect(s.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.rights.length).toBeGreaterThan(5);
      }
    }
  });
  it('health entries are flagged general-information-only and never prescribe', () => {
    const health = entries.filter((e) => e.domain === 'health');
    expect(health.length).toBeGreaterThan(0);
    for (const e of health) {
      expect(e.healthGeneralInfoOnly).toBe(true);
      for (const r of e.renderings) {
        expect(r.body).not.toMatch(/\b\d+\s?(mg|ml)\b/i);
        expect(r.body).not.toMatch(/\btake (paracetamol|amoxicillin|coartem)\b/i);
      }
    }
  });
  it('non-English renderings are honestly marked as not native-reviewed until validated', () => {
    for (const e of entries) for (const r of e.renderings) if (r.language !== 'en' && r.nativeReviewed) expect(r.reviewedBy).toBeTruthy();
  });
  it('supports Asante and Akuapem Twi as distinct varieties', () => {
    const emergency = entries.find((e) => e.id === 'emergency-numbers')!;
    const langs = emergency.renderings.map((r) => r.language);
    expect(langs).toContain('ak-asante');
    expect(langs).toContain('ak-akuapem');
    const maize = glossary.find((g) => g.concept === 'maize')!;
    expect(maize.renderings['ak-asante']?.term).toBe('aburo');
    expect(maize.renderings['ak-akuapem']?.term).toBe('aburow');
  });
});
