import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServices } from '@/lib/ai/registry';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { badRequest, json, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const schema = z.object({ text: z.string().min(1).max(1500), language: z.enum(LANGUAGE_CODES as [string, ...string[]]) });

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return badRequest('Invalid request', e instanceof z.ZodError ? e.issues : undefined);
  }
  try {
    const { tts } = getServices();
    const lang = body.language as never;
    const result = await tts.synthesize({ text: body.text, language: lang });
    if (result.mode === 'browser' || !result.audio) {
      return json({ mode: 'browser', provider: result.provider, providerClaimsSupport: tts.supports(lang) });
    }
    return new Response(result.audio, {
      headers: { 'content-type': result.mimeType, 'x-tts-provider': result.provider, 'cache-control': 'private, max-age=3600' },
    });
  } catch (e) {
    return serverError(e);
  }
}
