import { describe, expect, it } from 'vitest';
import { ask } from '@/lib/rag/answer';
import { getIndex, glossary, services } from './helpers';
import type { LlmProvider } from '@/lib/ai/types';

describe('ask pipeline', () => {
  it('answers with citations, confidence and sources', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'How do I register for the Ghana Card?', language: 'en' }, { index, services, glossary });
    expect(r.kind).toBe('answer');
    expect(r.citations[0].entryId).toBe('ghana-card-registration');
    expect(r.citations[0].sources[0].publisher).toMatch(/National Identification Authority/);
    expect(r.citations[0].updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.confidence.level).toBeDefined();
    expect(r.text.length).toBeGreaterThan(20);
  });
  it('says it is not certain for unrelated questions', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'zebra quantum lottery numbers tomorrow', language: 'en' }, { index, services, glossary });
    expect(r.kind).toBe('not_certain');
    expect(r.text).toMatch(/not certain/i);
  });
  it('refuses to diagnose and shows escalation path instead of retrieval', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'Do I have malaria? I have fever', language: 'en' }, { index, services, glossary });
    expect(r.kind).toBe('safety');
    expect(r.safety.category).toBe('health_diagnosis');
    expect(r.text).toMatch(/health worker/i);
    expect(r.healthDisclaimer).toBe(true);
  });
  it('shows emergency numbers for emergencies', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'my brother is bleeding heavily after an accident', language: 'en' }, { index, services, glossary });
    expect(r.kind).toBe('safety');
    expect(r.safety.emergencyNumbers).toBe(true);
    expect(r.escalation?.phone).toBe('112');
    expect(r.citations[0]?.entryId).toBe('emergency-numbers');
  });
  it('adds a health disclaimer to general health answers', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'how to prevent malaria at home', language: 'en' }, { index, services, glossary });
    expect(r.kind).toBe('answer');
    expect(r.healthDisclaimer).toBe(true);
    expect(r.citations[0].entryId).toBe('malaria-prevention');
  });
  it('answers in Twi from the Twi rendering and records the not-native-reviewed caveat', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'Mɛyɛ dɛn akyerɛw me din agye Ghana Card?', language: 'ak-asante' }, { index, services, glossary });
    expect(r.kind).toBe('answer');
    expect(r.answerLanguage).toBe('ak-asante');
    expect(r.confidence.notes.join(' ')).toMatch(/native speaker/);
    expect(r.languageStatus.status).toBe('experimental');
  });
  it('falls back to the extractive answerer when a hosted model fails or violates health rules', async () => {
    const index = await getIndex();
    const bad: LlmProvider = { name: 'bad-llm', answer: async () => ({ text: 'You have malaria. Take 500 mg paracetamol.', usedPassageIds: ['malaria-prevention'], abstained: false, provider: 'bad-llm' }) };
    const r = await ask({ question: 'how to prevent malaria', language: 'en' }, { index, services: { ...services, llm: bad }, glossary });
    expect(r.provider.answerer).toBe('extractive-v1');
    expect(r.text).not.toMatch(/500 mg/);
    const failing: LlmProvider = { name: 'down', answer: async () => { throw new Error('boom'); } };
    const r2 = await ask({ question: 'How do I get a passport', language: 'en' }, { index, services: { ...services, llm: failing }, glossary });
    expect(r2.kind).toBe('answer');
    expect(r2.provider.answerer).toBe('extractive-v1');
  });
});

describe('domain-scoped assistant', () => {
  it('abstains on out-of-scope questions instead of answering with a marginal match', async () => {
    const index = await getIndex();
    const r = await ask({ question: 'How do I register for the Ghana Card?', language: 'en', domain: 'agriculture' }, { index, services, glossary });
    expect(r.kind).toBe('not_certain');
    const ok = await ask({ question: 'worms on my maize', language: 'en', domain: 'agriculture' }, { index, services, glossary });
    expect(ok.kind).toBe('answer');
    expect(ok.citations[0].entryId).toBe('fall-armyworm-management');
  });
});
