import { createHash } from 'node:crypto';
import type { LanguageCode } from '@/lib/i18n/languages';
import type { SafetyCategory } from '@/lib/rag/safety';
import type { ConfidenceLevel } from '@/lib/rag/confidence';

/**
 * Privacy-preserving analytics. We record *what happened*, never *what was
 * said*: no question text, no transcript, no audio, no identifiers beyond a
 * salted daily-rotating hash of the anonymous session id (so we can count
 * distinct sessions per day without linking days together).
 */
export interface AnalyticsEvent {
  type: 'ask' | 'stt' | 'tts' | 'feedback' | 'escalation' | 'pack_download' | 'language_switch';
  at: string;
  /** Salted hash, rotates daily; cannot be reversed to a device or person */
  sessionHash: string;
  language: LanguageCode;
  inputMode?: 'text' | 'voice';
  kind?: 'answer' | 'not_certain' | 'safety';
  confidence?: ConfidenceLevel;
  safetyCategory?: SafetyCategory;
  /** Entry ids cited (curated content ids are not personal data) */
  entryIds?: string[];
  domain?: string;
  latencyMs?: number;
  provider?: string;
  /** Feedback */
  rating?: 'helpful' | 'not_helpful';
  issue?: 'translation' | 'wrong' | 'outdated' | 'unsafe' | 'other';
  /** Region chosen by the user in settings, if any (coarse, optional) */
  region?: string;
}

export function sessionHash(anonymousSessionId: string, salt: string, day = new Date()): string {
  const dayKey = day.toISOString().slice(0, 10);
  return createHash('sha256').update(`${salt}:${dayKey}:${anonymousSessionId}`).digest('hex').slice(0, 24);
}

/** Fields that must never appear in an analytics event. Used by tests and the sink. */
const FORBIDDEN_KEYS = ['question', 'text', 'transcript', 'audio', 'email', 'phone', 'name', 'ip', 'userId'];

export function assertNoPersonalContent(event: Record<string, unknown>) {
  for (const k of Object.keys(event)) {
    if (FORBIDDEN_KEYS.includes(k)) throw new Error(`Analytics event must not contain field "${k}"`);
  }
}

export interface AnalyticsSink {
  record(event: AnalyticsEvent): Promise<void>;
}

export class MemoryAnalyticsSink implements AnalyticsSink {
  events: AnalyticsEvent[] = [];
  async record(event: AnalyticsEvent) {
    assertNoPersonalContent(event as unknown as Record<string, unknown>);
    this.events.push(event);
  }
}

export class SupabaseAnalyticsSink implements AnalyticsSink {
  constructor(private readonly insert: (row: Record<string, unknown>) => Promise<void>) {}
  async record(event: AnalyticsEvent) {
    assertNoPersonalContent(event as unknown as Record<string, unknown>);
    await this.insert({
      type: event.type,
      at: event.at,
      session_hash: event.sessionHash,
      language: event.language,
      input_mode: event.inputMode ?? null,
      kind: event.kind ?? null,
      confidence: event.confidence ?? null,
      safety_category: event.safetyCategory ?? null,
      entry_ids: event.entryIds ?? [],
      domain: event.domain ?? null,
      latency_ms: event.latencyMs ?? null,
      provider: event.provider ?? null,
      rating: event.rating ?? null,
      issue: event.issue ?? null,
      region: event.region ?? null,
    });
  }
}

let sink: AnalyticsSink | null = null;
export async function getAnalyticsSink(): Promise<AnalyticsSink> {
  if (sink) return sink;
  if (process.env.GHANAVOICE_MODE === 'full' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getServiceClient } = await import('@/lib/db/supabase');
    const db = getServiceClient();
    sink = new SupabaseAnalyticsSink(async (row) => {
      const { error } = await db.from('analytics_events').insert(row);
      if (error) throw error;
    });
  } else {
    sink = new MemoryAnalyticsSink();
  }
  return sink;
}

/** Aggregations used by the admin analytics page. Works on any array of events. */
export function aggregate(events: AnalyticsEvent[]) {
  const byLanguage: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const bySafety: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const sessions = new Set<string>();
  let helpful = 0;
  let notHelpful = 0;
  let translationIssues = 0;
  const latencies: number[] = [];
  for (const e of events) {
    sessions.add(e.sessionHash);
    byLanguage[e.language] = (byLanguage[e.language] ?? 0) + 1;
    if (e.kind) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.safetyCategory && e.safetyCategory !== 'none') bySafety[e.safetyCategory] = (bySafety[e.safetyCategory] ?? 0) + 1;
    if (e.domain) byDomain[e.domain] = (byDomain[e.domain] ?? 0) + 1;
    if (e.rating === 'helpful') helpful++;
    if (e.rating === 'not_helpful') notHelpful++;
    if (e.issue === 'translation') translationIssues++;
    if (typeof e.latencyMs === 'number') latencies.push(e.latencyMs);
  }
  latencies.sort((a, b) => a - b);
  const p = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : null);
  return {
    total: events.length,
    distinctSessions: sessions.size,
    byLanguage,
    byKind,
    bySafety,
    byDomain,
    feedback: { helpful, notHelpful, translationIssues },
    latency: { p50: p(0.5), p95: p(0.95) },
  };
}
