import { NextRequest } from 'next/server';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getRepository } from '@/lib/db/repository-factory';
import { glossarySchema } from '@/lib/kb/load-content';
import { invalidatePipeline } from '@/lib/rag/pipeline';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  const repo = await getRepository();
  return json({ terms: await repo.listGlossary() });
}

export async function POST(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'editor')) return forbidden();
  const parsed = glossarySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid glossary term', parsed.error.issues);
  try {
    const repo = await getRepository();
    await repo.upsertGlossaryTerm({ ...parsed.data, updatedOn: new Date().toISOString().slice(0, 10) } as never);
    invalidatePipeline();
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
