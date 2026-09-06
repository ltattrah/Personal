import { NextRequest } from 'next/server';
import { z } from 'zod';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { getAnalyticsSink, sessionHash } from '@/lib/analytics/events';
import { badRequest, json, serverError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Human escalation. GhanaVoice does not run a call centre; it hands off to
 * the partner institution configured per domain (docs/03). In full mode a
 * ticket row is created that the institution's staff see in their queue; the
 * citizen receives a reference number and the direct contact details. Contact
 * details the citizen chooses to leave are stored ONLY in the ticket table
 * (never analytics) and purged 30 days after closure.
 */
const schema = z.object({
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
  domain: z.enum(['public-service', 'education', 'agriculture', 'health', 'other']),
  entryIds: z.array(z.string()).max(5).default([]),
  /** The citizen's question, included only because they asked for a human to read it */
  question: z.string().min(1).max(2000),
  contact: z.object({ method: z.enum(['phone', 'sms', 'none']), value: z.string().max(40).optional() }).default({ method: 'none' }),
  sessionId: z.string().max(64).optional(),
});

const CONTACTS: Record<string, { label: string; phone?: string; url?: string }> = {
  'public-service': { label: 'Your district assembly client service unit' },
  education: { label: 'Ghana Education Service district office' },
  agriculture: { label: 'District Department of Agriculture / extension agent' },
  health: { label: 'Nearest CHPS compound or clinic; emergency 112', phone: '112' },
  other: { label: 'GhanaVoice partner desk' },
};

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid escalation', parsed.error.issues);
  const b = parsed.data;
  try {
    const reference = `GV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (process.env.GHANAVOICE_MODE === 'full') {
      const { getServiceClient } = await import('@/lib/db/supabase');
      const { error } = await getServiceClient().from('escalations').insert({
        reference,
        language: b.language,
        domain: b.domain,
        entry_ids: b.entryIds,
        question: b.question,
        contact_method: b.contact.method,
        contact_value: b.contact.method === 'none' ? null : b.contact.value ?? null,
        status: 'open',
      });
      if (error) throw error;
    }
    const sink = await getAnalyticsSink();
    await sink.record({
      type: 'escalation',
      at: new Date().toISOString(),
      sessionHash: sessionHash(b.sessionId ?? 'anonymous', process.env.ANALYTICS_SALT ?? 'dev'),
      language: b.language as never,
      domain: b.domain,
      entryIds: b.entryIds,
    });
    return json({ reference, contact: CONTACTS[b.domain], stored: process.env.GHANAVOICE_MODE === 'full' });
  } catch (e) {
    return serverError(e);
  }
}
