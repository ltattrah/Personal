import { NextRequest } from 'next/server';
import { getRepository } from '@/lib/db/repository-factory';
import { buildPack, PACK_DOMAINS } from '@/lib/offline/packs';
import { isLanguageCode } from '@/lib/i18n/languages';
import { badRequest, json, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [domain, language] = id.split('--');
  if (!PACK_DOMAINS.includes(domain as never) || !isLanguageCode(language)) return badRequest('Unknown pack');
  try {
    const repo = await getRepository();
    const entries = await repo.listEntries({ status: ['published'] });
    const pack = buildPack(entries, domain, language);
    return json(pack, { headers: { 'cache-control': 'public, max-age=3600' } });
  } catch (e) {
    return serverError(e);
  }
}
