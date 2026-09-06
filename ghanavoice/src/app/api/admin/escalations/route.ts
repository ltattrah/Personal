import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin } from '@/lib/admin/auth';
import { getOpsStore } from '@/lib/ops/store';
import { badRequest, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  try {
    const status = req.nextUrl.searchParams.get('status') as 'open' | 'in_progress' | 'closed' | null;
    return json({ escalations: await (await getOpsStore()).listEscalations(status ?? undefined) });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  const parsed = z.object({ id: z.string(), status: z.enum(['open', 'in_progress', 'closed']) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid request', parsed.error.issues);
  try {
    await (await getOpsStore()).setEscalationStatus(parsed.data.id, parsed.data.status);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
