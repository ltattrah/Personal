import { describe, expect, it } from 'vitest';
import { canTransition } from '@/lib/admin/auth';
import { InMemoryRepository } from '@/lib/kb/repository';
import { entries } from './helpers';
import { entrySchema } from '@/lib/kb/load-content';

describe('content workflow', () => {
  const editor = { id: '1', email: 'e@x', roles: ['editor' as const] };
  const reviewer = { id: '2', email: 'r@x', roles: ['reviewer' as const] };
  const publisher = { id: '3', email: 'p@x', roles: ['publisher' as const] };
  it('enforces role-based transitions', () => {
    expect(canTransition('draft', 'in_review', editor)).toBe(true);
    expect(canTransition('draft', 'published', editor)).toBe(false);
    expect(canTransition('in_review', 'approved', editor)).toBe(false);
    expect(canTransition('in_review', 'approved', reviewer)).toBe(true);
    expect(canTransition('approved', 'published', reviewer)).toBe(false);
    expect(canTransition('approved', 'published', publisher)).toBe(true);
  });
  it('records an audit trail', async () => {
    const repo = new InMemoryRepository(entries.map((e) => ({ ...e })));
    await repo.setStatus('ghana-card-registration', 'draft', 'e@x', 'edited');
    expect(repo.audit[0]).toMatchObject({ id: 'ghana-card-registration', status: 'draft', actor: 'e@x' });
  });
  it('schema rejects health entries without the general-info flag and entries without sources', () => {
    const base = entries.find((e) => e.domain === 'health')!;
    expect(() => entrySchema.parse({ ...base, healthGeneralInfoOnly: undefined })).toThrow(/healthGeneralInfoOnly/);
    expect(() => entrySchema.parse({ ...base, sources: [] })).toThrow(/source/);
    expect(() => entrySchema.parse({ ...base, renderings: base.renderings.filter((r) => r.language !== 'en') })).toThrow(/English/);
  });
});
