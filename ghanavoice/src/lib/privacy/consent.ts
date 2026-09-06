/**
 * Consent model. Consent is explicit, per purpose, revocable and recorded
 * with a version of the wording shown, so a later change of wording requires
 * re-consent. Audio is never stored without `audioStorage` consent; the
 * transcript alone can be processed transiently to answer the question.
 */
export type ConsentPurpose = 'audioStorage' | 'audioResearchUse' | 'conversationHistory' | 'qualityFeedback';

export const CONSENT_TEXT_VERSION = '2026-09-01.v1';

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Version of the consent text the person saw */
  textVersion: string;
  /** ISO time */
  at: string;
  /** Retention the user chose, in days (audio only) */
  retentionDays?: number;
}

export interface ConsentState {
  records: Partial<Record<ConsentPurpose, ConsentRecord>>;
}

export const RETENTION_CHOICES_DAYS = [1, 7, 30] as const;

export function defaultConsent(): ConsentState {
  return { records: {} };
}

export function hasConsent(state: ConsentState, purpose: ConsentPurpose): boolean {
  const r = state.records[purpose];
  return Boolean(r && r.granted && r.textVersion === CONSENT_TEXT_VERSION);
}

export function setConsent(state: ConsentState, purpose: ConsentPurpose, granted: boolean, retentionDays?: number): ConsentState {
  return {
    records: {
      ...state.records,
      [purpose]: { purpose, granted, textVersion: CONSENT_TEXT_VERSION, at: new Date().toISOString(), retentionDays },
    },
  };
}

/** Clamp a requested retention to policy (env AUDIO_RETENTION_DAYS_MAX) and allowed choices. */
export function effectiveRetentionDays(requested: number | undefined, policyMax: number): number {
  const choice = RETENTION_CHOICES_DAYS.includes((requested ?? 0) as (typeof RETENTION_CHOICES_DAYS)[number]) ? (requested as number) : RETENTION_CHOICES_DAYS[1];
  return Math.min(choice, policyMax);
}

export function audioExpiryIso(retentionDays: number, from = new Date()): string {
  return new Date(from.getTime() + retentionDays * 86_400_000).toISOString();
}
