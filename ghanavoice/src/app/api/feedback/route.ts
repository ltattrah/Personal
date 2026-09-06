import { NextRequest } from 'next/server';
import { z } from 'zod';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { getAnalyticsSink, sessionHash } from '@/lib/analytics/events';
import { badRequest, json, serverError } from '@/lib/http';
import { getOpsStore } from '@/lib/ops/store';

export const runtime = 'nodejs';

const schema = z.object({
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
  rating: z.enum(['helpful', 'not_helpful']).optional(),
  issue: z.enum(['translation', 'wrong', 'outdated', 'unsafe', 'other']).optional(),
  entryIds: z.array(z.string()).max(10).default([]),
  /**
   * Optional free-text correction from the user (e.g. a better Twi wording).
   * Stored in the review queue (full mode) for editors, NOT in analytics.
   * The UI tells the user this text will be read by reviewers.
   */
  suggestedText: z.string().max(1000).optional(),
  sessionId: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid feedback', parsed.error.issues);
  const b = parsed.data;
  try {
    const sink = await getAnalyticsSink();
    await sink.record({
      type: 'feedback',
      at: new Date().toISOString(),
      sessionHash: sessionHash(b.sessionId ?? 'anonymous', process.env.ANALYTICS_SALT ?? 'dev'),
      language: b.language as never,
      rating: b.rating,
      issue: b.issue,
      entryIds: b.entryIds,
    });
    if (b.suggestedText) {
      const store = await getOpsStore();
      await store.createFeedback({ language: b.language as never, issue: b.issue ?? 'other', entryIds: b.entryIds, suggestedText: b.suggestedText });
    }
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
