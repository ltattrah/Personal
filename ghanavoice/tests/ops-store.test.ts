import { describe, expect, it } from 'vitest';
import { MemoryOpsStore } from '@/lib/ops/store';
import { generateApiKey, hashApiKey } from '@/lib/billing/api-keys';

describe('operational store (memory)', () => {
  it('tracks escalation lifecycle', async () => {
    const s = new MemoryOpsStore();
    const e = await s.createEscalation({ reference: 'GV-1', language: 'ee', domain: 'health', entryIds: [], question: 'q', contactMethod: 'none' });
    expect((await s.listEscalations('open')).map((x) => x.id)).toEqual([e.id]);
    await s.setEscalationStatus(e.id, 'closed');
    expect(await s.listEscalations('open')).toEqual([]);
    expect((await s.listEscalations('closed'))[0].closedAt).toBeTruthy();
  });
  it('triages feedback with the handler recorded', async () => {
    const s = new MemoryOpsStore();
    const f = await s.createFeedback({ language: 'ak-akuapem', issue: 'translation', entryIds: ['x'], suggestedText: 'aburow' });
    await s.setFeedbackStatus(f.id, 'accepted', 'r@x');
    expect((await s.listFeedback())[0]).toMatchObject({ status: 'accepted', handledBy: 'r@x' });
  });
  it('issues hashed API keys, meters usage and revokes', async () => {
    const s = new MemoryOpsStore();
    const { plaintext, hash, prefix } = generateApiKey();
    expect(plaintext.startsWith('gv_')).toBe(true);
    expect(hash).toBe(hashApiKey(plaintext));
    const rec = await s.createApiKey({ organisationId: 'org', plan: 'api', keyHash: hash, prefix });
    expect(await s.findApiKeyByHash(hash)).toMatchObject({ id: rec.id });
    const month = new Date().toISOString().slice(0, 7);
    expect(await s.incrementApiKeyUsage(rec.id, month)).toBe(1);
    expect(await s.incrementApiKeyUsage(rec.id, month)).toBe(2);
    expect((await s.listApiKeys())[0].usageThisMonth).toBe(2);
    expect(await s.incrementApiKeyUsage(rec.id, '1999-01')).toBe(1); // usage is scoped per month
    await s.revokeApiKey(rec.id);
    expect(await s.findApiKeyByHash(hash)).toBeNull();
  });
  it('seeds the demo key only when asked', async () => {
    expect(await new MemoryOpsStore(true).findApiKeyByHash(hashApiKey('gv_demo'))).not.toBeNull();
    expect(await new MemoryOpsStore(false).findApiKeyByHash(hashApiKey('gv_demo'))).toBeNull();
  });
});
