import { describe, expect, it } from 'vitest';
import { HeuristicLanguageDetector } from '@/lib/ai/language-detect';

const d = new HeuristicLanguageDetector();

describe('language suggestion', () => {
  it('suggests English', () => {
    expect(d.detect('How do I register for the Ghana Card please').language).toBe('en');
  });
  it('suggests Ewe from unique letters and words', () => {
    expect(d.detect('Aleke mawɔ aŋlɔ ŋkɔ ɖe Ghana Card ƒe nu').language).toBe('ee');
  });
  it('suggests Ga', () => {
    expect(d.detect('Mɛni feemɔ maŋmaa migbɛi kɛ Ghana Card').language).toBe('gaa');
  });
  it('suggests Twi and separates Akuapem spellings', () => {
    expect(d.detect('Mɛyɛ dɛn na wobɛtumi aboa me wɔ ha')?.language).toBe('ak-asante');
    expect(d.detect('Wubetumi aboa me wɔ ha na midua aburow')?.language).toBe('ak-akuapem');
  });
  it('returns null for text it cannot place', () => {
    expect(d.detect('112').language).toBeNull();
    expect(d.detect('').language).toBeNull();
  });
  it('never claims certainty: scores are heuristic and alternatives are offered', () => {
    const s = d.detect('Aleke mawɔ aŋlɔ ŋkɔ');
    expect(s.alternatives.length).toBeGreaterThan(1);
    expect(s.score).toBeLessThanOrEqual(2);
  });
});
