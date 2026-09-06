import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiKeyRecord } from '@/lib/billing/api-keys';
import type { PlanId } from '@/lib/billing/plans';
import type { LanguageCode } from '@/lib/i18n/languages';
import type { AudioSampleRecord, EscalationRecord, EscalationStatus, FeedbackStatus, FeedbackSuggestionRecord, OpsStore } from './store';

/** PostgreSQL implementation; table shapes in supabase/migrations/0001_init.sql. */
export class SupabaseOpsStore implements OpsStore {
  constructor(private readonly db: SupabaseClient) {}

  async createEscalation(e: Omit<EscalationRecord, 'id' | 'createdAt' | 'status'>) {
    const { data, error } = await this.db
      .from('escalations')
      .insert({
        reference: e.reference,
        language: e.language,
        domain: e.domain,
        entry_ids: e.entryIds,
        question: e.question,
        contact_method: e.contactMethod,
        contact_value: e.contactValue ?? null,
        status: 'open',
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToEscalation(data);
  }
  async listEscalations(status?: EscalationStatus) {
    let q = this.db.from('escalations').select('*').order('created_at', { ascending: false }).limit(500);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToEscalation);
  }
  async setEscalationStatus(id: string, status: EscalationStatus) {
    const { error } = await this.db.from('escalations').update({ status, closed_at: status === 'closed' ? new Date().toISOString() : null }).eq('id', Number(id));
    if (error) throw error;
  }

  async createFeedback(f: Omit<FeedbackSuggestionRecord, 'id' | 'createdAt' | 'status'>) {
    const { data, error } = await this.db
      .from('feedback_suggestions')
      .insert({ language: f.language, issue: f.issue, entry_ids: f.entryIds, suggested_text: f.suggestedText })
      .select('*')
      .single();
    if (error) throw error;
    return rowToFeedback(data);
  }
  async listFeedback(status?: FeedbackStatus) {
    let q = this.db.from('feedback_suggestions').select('*').order('created_at', { ascending: false }).limit(500);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToFeedback);
  }
  async setFeedbackStatus(id: string, status: FeedbackStatus, handledBy: string) {
    const { error } = await this.db.from('feedback_suggestions').update({ status, handled_by: handledBy }).eq('id', Number(id));
    if (error) throw error;
  }

  async createApiKey(k: { organisationId: string; plan: PlanId; domainScope?: string; keyHash: string; prefix: string }) {
    const { data, error } = await this.db
      .from('api_keys')
      .insert({ organisation_id: k.organisationId, plan: k.plan, key_hash: k.keyHash, prefix: k.prefix, domain_scope: k.domainScope ?? null })
      .select('*')
      .single();
    if (error) throw error;
    return rowToKey(data);
  }
  async listApiKeys() {
    const month = new Date().toISOString().slice(0, 7);
    const { data, error } = await this.db.from('api_keys').select('*, api_key_usage(month, count)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      ...rowToKey(r),
      usageThisMonth: Number((r.api_key_usage as { month: string; count: number }[] | null)?.find((u) => u.month === month)?.count ?? 0),
    }));
  }
  async revokeApiKey(id: string) {
    const { error } = await this.db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }
  async findApiKeyByHash(hash: string) {
    const { data, error } = await this.db.from('api_keys').select('*').eq('key_hash', hash).is('revoked_at', null).maybeSingle();
    if (error) throw error;
    return data ? rowToKey(data) : null;
  }
  async incrementApiKeyUsage(id: string, month: string) {
    const { data, error } = await this.db.rpc('api_key_increment_usage', { p_key_id: id, p_month: month });
    if (error) throw error;
    return Number(data);
  }

  async listAudioForReview(language?: LanguageCode) {
    let q = this.db.from('audio_samples').select('*').is('transcript_human', null).is('deleted_at', null).order('created_at').limit(200);
    if (language) q = q.eq('language', language);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(
      (r): AudioSampleRecord => ({
        id: r.id,
        storagePath: r.storage_path,
        language: r.language ?? undefined,
        transcriptMachine: r.transcript_machine ?? undefined,
        transcriptHuman: r.transcript_human ?? undefined,
        transcriptReviewedBy: r.transcript_reviewed_by ?? undefined,
        sttProvider: r.stt_provider ?? undefined,
        sttConfidence: r.stt_confidence ?? undefined,
        researchUse: r.research_use,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }),
    );
  }
  async saveHumanTranscript(id: string, transcript: string, reviewer: string) {
    const { error } = await this.db.from('audio_samples').update({ transcript_human: transcript, transcript_reviewed_by: reviewer }).eq('id', id);
    if (error) throw error;
  }

  /** Signed URL so a reviewer can listen; expires quickly. */
  async audioUrl(storagePath: string): Promise<string | null> {
    const { data } = await this.db.storage.from('audio-samples').createSignedUrl(storagePath, 600);
    return data?.signedUrl ?? null;
  }
}

type Row = Record<string, unknown>;
function rowToEscalation(r: Row): EscalationRecord {
  return {
    id: String(r.id),
    reference: r.reference as string,
    language: r.language as LanguageCode,
    domain: r.domain as string,
    entryIds: (r.entry_ids as string[]) ?? [],
    question: r.question as string,
    contactMethod: r.contact_method as EscalationRecord['contactMethod'],
    contactValue: (r.contact_value as string | null) ?? undefined,
    status: r.status as EscalationStatus,
    createdAt: r.created_at as string,
    closedAt: (r.closed_at as string | null) ?? undefined,
  };
}
function rowToFeedback(r: Row): FeedbackSuggestionRecord {
  return {
    id: String(r.id),
    language: r.language as LanguageCode,
    issue: r.issue as FeedbackSuggestionRecord['issue'],
    entryIds: (r.entry_ids as string[]) ?? [],
    suggestedText: r.suggested_text as string,
    status: r.status as FeedbackStatus,
    handledBy: (r.handled_by as string | null) ?? undefined,
    createdAt: r.created_at as string,
  };
}
function rowToKey(r: Row): ApiKeyRecord {
  return {
    id: r.id as string,
    organisationId: r.organisation_id as string,
    plan: r.plan as PlanId,
    keyHash: r.key_hash as string,
    prefix: r.prefix as string,
    createdAt: r.created_at as string,
    revokedAt: (r.revoked_at as string | null) ?? undefined,
    domainScope: (r.domain_scope as string | null) ?? undefined,
  };
}
