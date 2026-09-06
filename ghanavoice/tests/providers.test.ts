import { describe, expect, it } from 'vitest';
import { buildServices } from '@/lib/ai/registry';
import { parseGroundedOutput, buildGroundedPrompt } from '@/lib/ai/providers/llm/prompt';
import { silentWav } from '@/lib/ai/providers/tts/mock';

describe('provider registry', () => {
  it('defaults to mock/extractive providers with no configuration', () => {
    const s = buildServices({});
    expect(s.stt.name).toBe('mock-stt');
    expect(s.llm.name).toBe('extractive-v1');
    expect(s.embeddings.name).toBe('hash-ngram-v1');
    expect(s.tts.name).toBe('browser-tts');
  });
  it('fails loudly when a provider is selected without credentials', () => {
    expect(() => buildServices({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => buildServices({ STT_PROVIDER: 'http' })).toThrow(/STT_HTTP_URL/);
  });
  it('mock STT never fabricates a confidence value', async () => {
    const s = buildServices({});
    const r = await s.stt.transcribe({ audio: new ArrayBuffer(8), mimeType: 'audio/webm', language: 'ee' });
    expect(r.confidence).toBeUndefined();
    expect(r.text.length).toBeGreaterThan(0);
  });
  it('OpenAI STT only claims English support', () => {
    const s = buildServices({ STT_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    expect(s.stt.supports('en')).toBe(true);
    expect(s.stt.supports('ak-asante')).toBe(false);
  });
});

describe('grounded prompt', () => {
  it('instructs variety-specific Twi and health mode', () => {
    const p = buildGroundedPrompt({ question: 'q', language: 'ak-akuapem', passages: [{ id: 'a', title: 't', text: 'x', language: 'en' }], healthMode: true });
    expect(p.system).toMatch(/Akuapem/);
    expect(p.system).toMatch(/HEALTH MODE/);
    expect(p.system).toMatch(/ABSTAIN/);
  });
  it('parses USED lines and abstentions', () => {
    expect(parseGroundedOutput('Answer here.\nUSED: a, b', 'p').usedPassageIds).toEqual(['a', 'b']);
    expect(parseGroundedOutput('ABSTAIN', 'p').abstained).toBe(true);
  });
});

describe('mock tts', () => {
  it('produces a valid WAV header', () => {
    const buf = silentWav(1);
    const s = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
    expect(s).toBe('RIFF');
    expect(buf.byteLength).toBe(44 + 8000 * 2);
  });
});
