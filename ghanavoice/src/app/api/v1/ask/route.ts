import { NextRequest } from 'next/server';
import { z } from 'zod';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { getPipeline } from '@/lib/rag/pipeline';
import { getServices } from '@/lib/ai/registry';
import { ask } from '@/lib/rag/answer';
import { currentMonth, hashApiKey } from '@/lib/billing/api-keys';
import { getOpsStore } from '@/lib/ops/store';
import { PLANS } from '@/lib/billing/plans';
import { badRequest, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Licensed API surface (plans: api, organisation-assistant). Same pipeline
 * as the citizen app so licensees inherit the safety layer, citations and
 * confidence. Organisation-specific assistants pass a domain scope bound to
 * their key so retrieval is restricted to their private content.
 */
const schema = z.object({
  question: z.string().min(1).max(1000),
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
});

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return unauthorized('Provide an API key as Bearer token');
  const store = await getOpsStore();
  const key = await store.findApiKeyByHash(hashApiKey(auth.slice(7)));
  if (!key) return unauthorized('Unknown or revoked API key');
  const plan = PLANS[key.plan];
  if (!plan.entitlements.apiAccess) return unauthorized('Plan does not include API access');
  const used = await store.incrementApiKeyUsage(key.id, currentMonth());
  if (plan.entitlements.monthlyQuestions !== 'unlimited' && used > plan.entitlements.monthlyQuestions) {
    return json({ error: 'Monthly quota exceeded' }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid request', parsed.error.issues);
  try {
    const { index, glossary } = await getPipeline();
    const result = await ask({ question: parsed.data.question, language: parsed.data.language as never, domain: key.domainScope }, { index, services: getServices(), glossary });
    const { trace: _t, ...pub } = result;
    void _t;
    return json({ ...pub, usage: { month: currentMonth(), used, quota: plan.entitlements.monthlyQuestions } });
  } catch (e) {
    return serverError(e);
  }
}
