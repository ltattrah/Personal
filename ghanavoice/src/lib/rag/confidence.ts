import type { RetrievedPassage } from '@/lib/kb/types';
import type { SupportStatus } from '@/lib/i18n/languages';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceBreakdown {
  level: ConfidenceLevel;
  /** 0..1, transparent composite, NOT a probability the answer is correct */
  score: number;
  factors: {
    retrievalTop: number;
    retrievalMargin: number;
    languageFallback: boolean;
    nativeReviewed: boolean;
    stale: boolean;
    languageStatus: SupportStatus;
    sttConfidence?: number;
  };
  /** Reasons shown to the user when confidence is not high */
  notes: string[];
}

/**
 * Confidence is a composite of signals we can actually observe:
 * retrieval strength and margin, whether we had to fall back to another
 * language, whether the content was reviewed by a native speaker, whether the
 * entry is past its review-by date, the language's evaluation status and the
 * STT confidence when the question came from speech. We label the output as
 * an indicator, never as accuracy, because no accuracy has been measured
 * until evaluation runs exist.
 */
export function computeConfidence(
  passages: RetrievedPassage[],
  opts: { languageStatus: SupportStatus; sttConfidence?: number; today?: Date },
): ConfidenceBreakdown {
  const today = opts.today ?? new Date();
  const notes: string[] = [];
  if (passages.length === 0) {
    return {
      level: 'low',
      score: 0,
      factors: { retrievalTop: 0, retrievalMargin: 0, languageFallback: false, nativeReviewed: false, stale: false, languageStatus: opts.languageStatus, sttConfidence: opts.sttConfidence },
      notes: ['No matching information in the knowledge base.'],
    };
  }
  const top = passages[0];
  const second = passages[1]?.score ?? 0;
  const margin = Math.max(0, top.score - second);
  const stale = new Date(top.entry.reviewBy) < today;

  let score = top.score * 0.6 + Math.min(margin * 2, 0.4) * 0.5;
  // Weak and ambiguous: several entries matched about equally and none well.
  // Typical of out-of-scope questions in a domain-scoped assistant. Abstain
  // rather than present the marginal winner as the answer.
  if (top.score < 0.5 && margin < 0.05 && passages.length > 1) {
    score = Math.min(score, 0.2);
    notes.push('Several topics matched about equally and none matched well.');
  }
  if (top.languageFallback) {
    score *= 0.8;
    notes.push('Answer shown in a different language variety from the one you selected.');
  }
  if (!top.rendering.nativeReviewed && top.rendering.language !== 'en') {
    score *= 0.75;
    notes.push('This translation has not yet been checked by a native speaker.');
  }
  if (stale) {
    score *= 0.85;
    notes.push(`This information was due for re-verification on ${top.entry.reviewBy}.`);
  }
  if (opts.languageStatus !== 'evaluated') {
    score *= 0.9;
    notes.push('Support for this language is experimental and has not been evaluated with native speakers.');
  }
  if (opts.sttConfidence !== undefined) {
    if (opts.sttConfidence < 0.5) {
      score *= 0.7;
      notes.push('The speech recogniser was unsure what you said. Check the transcript.');
    } else if (opts.sttConfidence < 0.75) {
      score *= 0.9;
    }
  }
  score = Math.round(Math.min(1, score) * 100) / 100;
  const level: ConfidenceLevel = score >= 0.6 ? 'high' : score >= 0.35 ? 'medium' : 'low';
  return {
    level,
    score,
    factors: {
      retrievalTop: top.score,
      retrievalMargin: Math.round(margin * 1000) / 1000,
      languageFallback: top.languageFallback,
      nativeReviewed: top.rendering.nativeReviewed,
      stale,
      languageStatus: opts.languageStatus,
      sttConfidence: opts.sttConfidence,
    },
    notes,
  };
}

/** Below this the pipeline answers "I am not certain" instead of presenting the passage as an answer. */
export const ABSTAIN_THRESHOLD = 0.25;
