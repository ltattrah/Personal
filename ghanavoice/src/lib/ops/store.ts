import { hashApiKey, type ApiKeyRecord } from '@/lib/billing/api-keys';
import type { PlanId } from '@/lib/billing/plans';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Operational records that are not knowledge-base content: escalation tickets,
 * citizen feedback suggestions, API keys and consent-gated audio samples.
 * One interface, two implementations (memory for demo mode and tests,
 * Supabase for full mode) so every API route and admin page works in both.
 */

export type EscalationStatus = 'open' | 'in_progress' | 'closed';
export interface EscalationRecord {
  id: string;
  reference: string;
  language: LanguageCode;
  domain: string;
  entryIds: string[];
  question: string;
  contactMethod: 'phone' | 'sms' | 'none';
  contactValue?: string;
  status: EscalationStatus;
  createdAt: string;
  closedAt?: string;
}

export type FeedbackStatus = 'open' | 'accepted' | 'rejected';
export interface FeedbackSuggestionRecord {
  id: string;
  language: LanguageCode;
  issue: 'translation' | 'wrong' | 'outdated' | 'unsafe' | 'other';
  entryIds: string[];
  suggestedText: string;
  status: FeedbackStatus;
  handledBy?: string;
  createdAt: string;
}

export interface AudioSampleRecord {
  id: string;
  storagePath: string;
  language?: LanguageCode;
  transcriptMachine?: string;
  transcriptHuman?: string;
  transcriptReviewedBy?: string;
  sttProvider?: string;
  sttConfidence?: number;
  researchUse: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface OpsStore {
  createEscalation(e: Omit<EscalationRecord, 'id' | 'createdAt' | 'status'>): Promise<EscalationRecord>;
  listEscalations(status?: EscalationStatus): Promise<EscalationRecord[]>;
  setEscalationStatus(id: string, status: EscalationStatus): Promise<void>;

  createFeedback(f: Omit<FeedbackSuggestionRecord, 'id' | 'createdAt' | 'status'>): Promise<FeedbackSuggestionRecord>;
  listFeedback(status?: FeedbackStatus): Promise<FeedbackSuggestionRecord[]>;
  setFeedbackStatus(id: string, status: FeedbackStatus, handledBy: string): Promise<void>;

  createApiKey(k: { organisationId: string; plan: PlanId; domainScope?: string; keyHash: string; prefix: string }): Promise<ApiKeyRecord>;
  listApiKeys(): Promise<(ApiKeyRecord & { usageThisMonth: number })[]>;
  revokeApiKey(id: string): Promise<void>;
  findApiKeyByHash(hash: string): Promise<ApiKeyRecord | null>;
  incrementApiKeyUsage(id: string, month: string): Promise<number>;

  /** Audio samples awaiting a human transcript (full mode only; memory returns []) */
  listAudioForReview(language?: LanguageCode): Promise<AudioSampleRecord[]>;
  saveHumanTranscript(id: string, transcript: string, reviewer: string): Promise<void>;
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export class MemoryOpsStore implements OpsStore {
  escalations: EscalationRecord[] = [];
  feedback: FeedbackSuggestionRecord[] = [];
  apiKeys: ApiKeyRecord[] = [];
  usage = new Map<string, number>();
  audio: AudioSampleRecord[] = [];

  constructor(seedDemoKey = false) {
    if (seedDemoKey) {
      this.apiKeys.push({ id: 'demo', organisationId: 'demo-org', plan: 'api', keyHash: hashApiKey('gv_demo'), prefix: 'gv_demo', createdAt: new Date().toISOString() });
    }
  }

  async createEscalation(e: Omit<EscalationRecord, 'id' | 'createdAt' | 'status'>) {
    const rec: EscalationRecord = { ...e, id: uid(), status: 'open', createdAt: new Date().toISOString() };
    this.escalations.unshift(rec);
    return rec;
  }
  async listEscalations(status?: EscalationStatus) {
    return this.escalations.filter((e) => !status || e.status === status);
  }
  async setEscalationStatus(id: string, status: EscalationStatus) {
    const e = this.escalations.find((x) => x.id === id);
    if (!e) throw new Error('Escalation not found');
    e.status = status;
    e.closedAt = status === 'closed' ? new Date().toISOString() : undefined;
  }

  async createFeedback(f: Omit<FeedbackSuggestionRecord, 'id' | 'createdAt' | 'status'>) {
    const rec: FeedbackSuggestionRecord = { ...f, id: uid(), status: 'open', createdAt: new Date().toISOString() };
    this.feedback.unshift(rec);
    return rec;
  }
  async listFeedback(status?: FeedbackStatus) {
    return this.feedback.filter((f) => !status || f.status === status);
  }
  async setFeedbackStatus(id: string, status: FeedbackStatus, handledBy: string) {
    const f = this.feedback.find((x) => x.id === id);
    if (!f) throw new Error('Feedback not found');
    f.status = status;
    f.handledBy = handledBy;
  }

  async createApiKey(k: { organisationId: string; plan: PlanId; domainScope?: string; keyHash: string; prefix: string }) {
    const rec: ApiKeyRecord = { id: uid(), createdAt: new Date().toISOString(), ...k };
    this.apiKeys.push(rec);
    return rec;
  }
  async listApiKeys() {
    const month = new Date().toISOString().slice(0, 7);
    return this.apiKeys.map((k) => ({ ...k, usageThisMonth: this.usage.get(`${k.id}:${month}`) ?? 0 }));
  }
  async revokeApiKey(id: string) {
    const k = this.apiKeys.find((x) => x.id === id);
    if (k) k.revokedAt = new Date().toISOString();
  }
  async findApiKeyByHash(hash: string) {
    return this.apiKeys.find((k) => k.keyHash === hash && !k.revokedAt) ?? null;
  }
  async incrementApiKeyUsage(id: string, month: string) {
    const key = `${id}:${month}`;
    const n = (this.usage.get(key) ?? 0) + 1;
    this.usage.set(key, n);
    return n;
  }

  async listAudioForReview(language?: LanguageCode) {
    return this.audio.filter((a) => !a.transcriptHuman && (!language || a.language === language));
  }
  async saveHumanTranscript(id: string, transcript: string, reviewer: string) {
    const a = this.audio.find((x) => x.id === id);
    if (!a) throw new Error('Audio sample not found');
    a.transcriptHuman = transcript;
    a.transcriptReviewedBy = reviewer;
  }
}

let store: OpsStore | null = null;
export async function getOpsStore(): Promise<OpsStore> {
  if (store) return store;
  if (process.env.GHANAVOICE_MODE === 'full' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseOpsStore } = await import('./supabase-ops-store');
    const { getServiceClient } = await import('@/lib/db/supabase');
    store = new SupabaseOpsStore(getServiceClient());
  } else {
    store = new MemoryOpsStore(true);
  }
  return store;
}

export function setOpsStoreForTests(s: OpsStore | null) {
  store = s;
}
