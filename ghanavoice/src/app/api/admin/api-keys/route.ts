import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getOpsStore } from '@/lib/ops/store';
import { generateApiKey } from '@/lib/billing/api-keys';
import { PLANS } from '@/lib/billing/plans';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'admin')) return forbidden();
  try {
    const keys = await (await getOpsStore()).listApiKeys();
    // Never return hashes to the browser.
    return json({ keys: keys.map(({ keyHash: _h, ...k }) => k) });
  } catch (e) {
    return serverError(e);
  }
}

const createSchema = z.object({
  organisationId: z.string().min(1),
  plan: z.enum(['api', 'organisation-assistant']),
  /** Topic prefix restricting retrieval for organisation assistants, e.g. "agriculture/" */
  domainScope: z.string().max(100).optional(),
});

/** Creates a key. The plaintext is returned exactly once. */
export async function POST(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'admin')) return forbidden();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid request', parsed.error.issues);
  if (!PLANS[parsed.data.plan].entitlements.apiAccess) return badRequest('Plan has no API access');
  try {
    const { plaintext, hash, prefix } = generateApiKey();
    const rec = await (await getOpsStore()).createApiKey({ ...parsed.data, keyHash: hash, prefix });
    return json({ id: rec.id, prefix, plaintext, plan: rec.plan, quota: PLANS[rec.plan].entitlements.monthlyQuestions });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'admin')) return forbidden();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return badRequest('id is required');
  try {
    await (await getOpsStore()).revokeApiKey(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
