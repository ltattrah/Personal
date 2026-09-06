import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, canTransition, hasRole } from '@/lib/admin/auth';
import { getRepository } from '@/lib/db/repository-factory';
import { entrySchema } from '@/lib/kb/load-content';
import type { KnowledgeEntry } from '@/lib/kb/types';
import { invalidatePipeline } from '@/lib/rag/pipeline';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  const repo = await getRepository();
  const entries = await repo.listEntries();
  return json({ entries, roles: admin.roles });
}

/** Create or update an entry. Any content change resets status to draft. */
export async function POST(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'editor')) return forbidden();
  const parsed = entrySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid entry', parsed.error.issues);
  try {
    const repo = await getRepository();
    await repo.upsertEntry({ ...(parsed.data as unknown as KnowledgeEntry), status: 'draft' });
    await repo.setStatus(parsed.data.id, 'draft', admin.email, 'content edited');
    invalidatePipeline();
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

const transitionSchema = z.object({ id: z.string(), to: z.enum(['draft', 'in_review', 'approved', 'published', 'retired']), note: z.string().max(500).optional() });

/** Workflow transition with role checks. */
export async function PATCH(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  const parsed = transitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid transition', parsed.error.issues);
  try {
    const repo = await getRepository();
    const entry = await repo.getEntry(parsed.data.id);
    if (!entry) return badRequest('Entry not found');
    if (!canTransition(entry.status, parsed.data.to, admin)) return forbidden(`Cannot move ${entry.status} -> ${parsed.data.to} with roles ${admin.roles.join(',')}`);
    // Publishing gate: health entries must be flagged; every entry needs a source verified within 12 months.
    if (parsed.data.to === 'published') {
      const twelveMonthsAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      if (!entry.sources.some((s) => s.verifiedOn >= twelveMonthsAgo)) return badRequest('Cannot publish: no source verified within the last 12 months');
      if (entry.domain === 'health' && !entry.healthGeneralInfoOnly) return badRequest('Cannot publish: health entry missing healthGeneralInfoOnly flag');
    }
    await repo.setStatus(entry.id, parsed.data.to, admin.email, parsed.data.note);
    invalidatePipeline();
    return json({ ok: true, status: parsed.data.to });
  } catch (e) {
    return serverError(e);
  }
}
