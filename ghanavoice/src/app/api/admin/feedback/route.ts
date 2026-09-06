import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getOpsStore } from '@/lib/ops/store';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  try {
    const status = req.nextUrl.searchParams.get('status') as 'open' | 'accepted' | 'rejected' | null;
    return json({ suggestions: await (await getOpsStore()).listFeedback(status ?? undefined) });
  } catch (e) {
    return serverError(e);
  }
}

/** Reviewers triage suggestions; accepting one is recorded and the editor then edits the entry (back to draft). */
export async function PATCH(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'reviewer')) return forbidden();
  const parsed = z.object({ id: z.string(), status: z.enum(['open', 'accepted', 'rejected']) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid request', parsed.error.issues);
  try {
    await (await getOpsStore()).setFeedbackStatus(parsed.data.id, parsed.data.status, admin.email);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
