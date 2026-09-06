import { describe, expect, it } from 'vitest';
import { aggregate, assertNoPersonalContent, MemoryAnalyticsSink, sessionHash } from '@/lib/analytics/events';

describe('analytics privacy', () => {
  it('rejects events that carry conversation text or identifiers', () => {
    expect(() => assertNoPersonalContent({ type: 'ask', question: 'x' })).toThrow();
    expect(() => assertNoPersonalContent({ type: 'ask', transcript: 'x' })).toThrow();
    expect(() => assertNoPersonalContent({ type: 'ask', language: 'en' })).not.toThrow();
  });
  it('session hashes rotate daily and are not reversible to the id', () => {
    const a = sessionHash('device-1', 'salt', new Date('2026-09-01'));
    const b = sessionHash('device-1', 'salt', new Date('2026-09-02'));
    expect(a).not.toBe(b);
    expect(a).not.toContain('device');
  });
  it('aggregates without exposing rows', async () => {
    const sink = new MemoryAnalyticsSink();
    await sink.record({ type: 'ask', at: 'now', sessionHash: 'a', language: 'ee', kind: 'answer', confidence: 'high', latencyMs: 100 });
    await sink.record({ type: 'ask', at: 'now', sessionHash: 'b', language: 'ee', kind: 'safety', safetyCategory: 'emergency', latencyMs: 300 });
    const agg = aggregate(sink.events);
    expect(agg.byLanguage.ee).toBe(2);
    expect(agg.bySafety.emergency).toBe(1);
    expect(agg.distinctSessions).toBe(2);
  });
});
