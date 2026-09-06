/**
 * Seed a Supabase project with the bundled content and compute embeddings with
 * the configured provider.
 *
 *   GHANAVOICE_MODE=full NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run kb:seed
 *
 * Flags:
 *   --as-draft   import everything as 'draft' so the deploying institution must
 *                re-verify sources and publish through the workflow (recommended
 *                for production).
 */
import { createClient } from '@supabase/supabase-js';
import { loadBundledEntries, loadBundledGlossary } from '../content/kb/index';
import { SupabaseRepository } from '../src/lib/db/supabase-repository';
import { buildServices } from '../src/lib/ai/registry';
import { renderingText } from '../src/lib/rag/retrieve';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const asDraft = process.argv.includes('--as-draft');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const repo = new SupabaseRepository(db);
  const services = buildServices();
  const entries = loadBundledEntries();
  for (const e of entries) {
    await repo.upsertEntry({ ...e, status: asDraft ? 'draft' : e.status });
    const texts = e.renderings.map(renderingText);
    if (services.embeddings.dimensions === 1536) {
      const vecs = await services.embeddings.embed(texts);
      for (let i = 0; i < e.renderings.length; i++) {
        const { error } = await db
          .from('kb_renderings')
          .update({ embedding: vecs[i], embedding_provider: services.embeddings.name })
          .eq('entry_id', e.id)
          .eq('language', e.renderings[i].language);
        if (error) throw error;
      }
    }
    console.log(`✔ ${e.id}`);
  }
  for (const g of loadBundledGlossary()) await repo.upsertGlossaryTerm(g);
  console.log(`Seeded ${entries.length} entries${asDraft ? ' as drafts' : ''}. Embeddings ${services.embeddings.dimensions === 1536 ? 'stored' : 'skipped (provider dimension != 1536; in-process index is used instead)'}.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
