import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getOpsStore } from '@/lib/ops/store';
import { isLanguageCode } from '@/lib/i18n/languages';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

/** Consented audio awaiting a native-speaker transcript. Reviewer role only. */
export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'reviewer')) return forbidden();
  try {
    const lang = req.nextUrl.searchParams.get('language');
    const store = await getOpsStore();
    const samples = await store.listAudioForReview(isLanguageCode(lang) ? lang : undefined);
    const withUrls = await Promise.all(
      samples.map(async (s) => ({
        ...s,
        url: 'audioUrl' in store && typeof (store as { audioUrl?: (p: string) => Promise<string | null> }).audioUrl === 'function' ? await (store as { audioUrl: (p: string) => Promise<string | null> }).audioUrl(s.storagePath) : null,
      })),
    );
    return json({ samples: withUrls });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'reviewer')) return forbidden();
  const parsed = z.object({ id: z.string().uuid(), transcript: z.string().min(1).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid request', parsed.error.issues);
  try {
    await (await getOpsStore()).saveHumanTranscript(parsed.data.id, parsed.data.transcript, admin.email);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
