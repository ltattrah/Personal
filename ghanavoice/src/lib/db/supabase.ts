import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function isFullMode(): boolean {
  return process.env.GHANAVOICE_MODE === 'full' && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

let serviceClient: SupabaseClient | null = null;

/** Server-side client using the service role key. Never import from client components. */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase service credentials are not configured');
    serviceClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return serviceClient;
}
