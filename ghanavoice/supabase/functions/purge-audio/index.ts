// Supabase Edge Function: delete storage objects for audio samples whose
// retention period has passed. Schedule hourly (Dashboard → Edge Functions →
// Schedules, or pg_cron calling net.http_post). Works together with the SQL
// function purge_expired_audio(), which marks rows deleted_at.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${Deno.env.get('PURGE_SECRET')}`) return new Response('unauthorized', { status: 401 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: marked, error: markErr } = await db.rpc('purge_expired_audio');
  if (markErr) return new Response(markErr.message, { status: 500 });

  const { data: rows, error } = await db.from('audio_samples').select('id, storage_path').not('deleted_at', 'is', null).limit(500);
  if (error) return new Response(error.message, { status: 500 });

  let removed = 0;
  for (const chunk of chunks((rows ?? []).map((r: any) => r.storage_path as string), 100)) {
    const { error: rmErr } = await db.storage.from('audio-samples').remove(chunk);
    if (rmErr) return new Response(rmErr.message, { status: 500 });
    removed += chunk.length;
  }
  // Rows are hard-deleted 7 days after deleted_at by purge_expired_audio(); the
  // storage object is already gone by then, so a re-run is harmless.
  return Response.json({ markedExpired: marked, storageObjectsRemoved: removed });
});

function* chunks<T>(arr: T[], n: number) {
  for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}
