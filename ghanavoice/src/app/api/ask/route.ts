import { NextRequest } from 'next/server';
import { z } from 'zod';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { getPipeline } from '@/lib/rag/pipeline';
import { getServices } from '@/lib/ai/registry';
import { ask } from '@/lib/rag/answer';
import { getAnalyticsSink, sessionHash } from '@/lib/analytics/events';
import { badRequest, json, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const bodySchema = z.object({
  question: z.string().min(1).max(1000),
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]),
  inputMode: z.enum(['text', 'voice']).default('text'),
  sttConfidence: z.number().min(0).max(1).optional(),
  /** Anonymous, client-generated, rotated by the client; hashed before storage */
  sessionId: z.string().max(64).optional(),
  region: z.string().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const started = Date.now();
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return badRequest('Invalid request', e instanceof z.ZodError ? e.issues : undefined);
  }
  try {
    const { index, glossary } = await getPipeline();
    const services = getServices();
    const result = await ask(
      { question: body.question, language: body.language as never, sttConfidence: body.sttConfidence },
      { index, services, glossary },
    );
    const latencyMs = Date.now() - started;
    const sink = await getAnalyticsSink();
    // Analytics never receive the question text.
    await sink.record({
      type: 'ask',
      at: new Date().toISOString(),
      sessionHash: sessionHash(body.sessionId ?? 'anonymous', process.env.ANALYTICS_SALT ?? 'dev'),
      language: body.language as never,
      inputMode: body.inputMode,
      kind: result.kind,
      confidence: result.confidence.level,
      safetyCategory: result.safety.category,
      entryIds: result.citations.map((c) => c.entryId),
      domain: result.domain,
      latencyMs,
      provider: result.provider.answerer,
      region: body.region,
    });
    // Strip the admin-only trace from citizen responses.
    const { trace: _trace, ...publicResult } = result;
    void _trace;
    return json({ ...publicResult, latencyMs });
  } catch (e) {
    return serverError(e);
  }
}
