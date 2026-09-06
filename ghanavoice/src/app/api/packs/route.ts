import { getRepository } from '@/lib/db/repository-factory';
import { buildManifests } from '@/lib/offline/packs';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';
import { json, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const repo = await getRepository();
    const entries = await repo.listEntries({ status: ['published'] });
    return json({ packs: buildManifests(entries, LANGUAGE_CODES) }, { headers: { 'cache-control': 'public, max-age=300' } });
  } catch (e) {
    return serverError(e);
  }
}
