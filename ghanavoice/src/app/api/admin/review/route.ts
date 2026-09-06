import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getRepository } from '@/lib/db/repository-factory';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { invalidatePipeline } from '@/lib/rag/pipeline';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Native-speaker sign-off for one rendering. Records reviewer and date, the
 * per-dimension scores (adequacy, fluency, register, orthography, 1-5) and
 * marks the rendering as native-reviewed only when every score is >= 4.
 * Scores below that send the rendering back with the reviewer's comment.
 */
const schema = z.object({
  entryId: z.string(),
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
  scores: z.object({ adequacy: z.number().int().min(1).max(5), fluency: z.number().int().min(1).max(5), register: z.number().int().min(1).max(5), orthography: z.number().int().min(1).max(5) }),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'reviewer')) return forbidden('Native-speaker review requires the reviewer role');
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid review', parsed.error.issues);
  const { entryId, language, scores, comment } = parsed.data;
  try {
    const repo = await getRepository();
    const entry = await repo.getEntry(entryId);
    if (!entry) return badRequest('Entry not found');
    const rendering = entry.renderings.find((r) => r.language === language);
    if (!rendering) return badRequest('Rendering not found');
    const passed = Object.values(scores).every((v) => v >= 4);
    const today = new Date().toISOString().slice(0, 10);
    rendering.nativeReviewed = passed;
    rendering.reviewedOn = passed ? today : undefined;
    rendering.reviewedBy = passed ? admin.email : undefined;
    await repo.upsertEntry(entry);
    await repo.setStatus(entry.id, entry.status, admin.email, `native review ${language}: ${passed ? 'passed' : 'failed'} ${JSON.stringify(scores)}${comment ? ' ' + comment : ''}`);
    invalidatePipeline();
    return json({ ok: true, passed, nativeReviewed: rendering.nativeReviewed });
  } catch (e) {
    return serverError(e);
  }
}
