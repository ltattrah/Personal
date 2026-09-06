import { NextRequest } from 'next/server';
import { authenticateAdmin } from '@/lib/admin/auth';
import { aggregate, getAnalyticsSink, MemoryAnalyticsSink, type AnalyticsEvent } from '@/lib/analytics/events';
import { json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  try {
    const sink = await getAnalyticsSink();
    let events: AnalyticsEvent[] = [];
    if (sink instanceof MemoryAnalyticsSink) events = sink.events;
    else {
      const { getServiceClient } = await import('@/lib/db/supabase');
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await getServiceClient().from('analytics_events').select('*').gte('at', since).limit(50_000);
      if (error) throw error;
      events = (data ?? []).map((r) => ({
        type: r.type,
        at: r.at,
        sessionHash: r.session_hash,
        language: r.language,
        inputMode: r.input_mode ?? undefined,
        kind: r.kind ?? undefined,
        confidence: r.confidence ?? undefined,
        safetyCategory: r.safety_category ?? undefined,
        entryIds: r.entry_ids ?? [],
        domain: r.domain ?? undefined,
        latencyMs: r.latency_ms ?? undefined,
        provider: r.provider ?? undefined,
        rating: r.rating ?? undefined,
        issue: r.issue ?? undefined,
        region: r.region ?? undefined,
      }));
    }
    return json({ windowDays: 30, ...aggregate(events), storesConversationText: false });
  } catch (e) {
    return serverError(e);
  }
}
