import { describe, expect, it } from 'vitest';
import { getIndex } from './helpers';
import retrievalItems from '../evaluation/datasets/retrieval.sample.json';

describe('hybrid retrieval', () => {
  it('finds the Ghana Card entry for an English question', async () => {
    const idx = await getIndex();
    const res = await idx.search('How do I get a Ghana Card?', { language: 'en' });
    expect(res[0].entry.id).toBe('ghana-card-registration');
    expect(res[0].languageFallback).toBe(false);
  });
  it('matches Twi typed without special characters', async () => {
    const idx = await getIndex();
    const res = await idx.search('Meye den akyerew me din agye Ghana Card', { language: 'ak-asante' });
    expect(res[0].entry.id).toBe('ghana-card-registration');
    expect(res[0].rendering.language).toBe('ak-asante');
  });
  it('falls back to a sister variety and labels it', async () => {
    const idx = await getIndex();
    // The Ghana Card entry has an Asante rendering but no Akuapem one.
    const res = await idx.search('Ghana Card din kyerɛw', { language: 'ak-akuapem' });
    expect(res[0].entry.id).toBe('ghana-card-registration');
    expect(res[0].languageFallback).toBe(true);
    expect(['ak-asante', 'en']).toContain(res[0].rendering.language);
  });
  it('returns one result per entry', async () => {
    const idx = await getIndex();
    const res = await idx.search('emergency police fire ambulance', { language: 'en', topK: 10 });
    const ids = res.map((r) => r.entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('achieves hit@3 on the whole sample retrieval set', async () => {
    const idx = await getIndex();
    const misses: string[] = [];
    for (const item of retrievalItems) {
      const res = await idx.search(item.question, { language: item.language as never, topK: 3 });
      if (!res.some((r) => item.relevantEntryIds.includes(r.entry.id))) misses.push(item.id);
    }
    expect(misses).toEqual([]);
  });
});
