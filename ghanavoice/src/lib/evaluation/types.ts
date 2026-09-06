import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Evaluation dataset structure. One JSONL file per task; each line is one item.
 * Items reference audio by relative path inside content/samples/audio and
 * must carry a rights statement. See evaluation/README.md.
 */

export interface SttItem {
  id: string;
  language: LanguageCode;
  /** Region/dialect note, e.g. "Kumasi urban", "Ho rural" */
  region?: string;
  speaker: { id: string; gender?: 'f' | 'm' | 'x'; ageBand?: '18-29' | '30-49' | '50+'; consentId: string };
  audioPath: string;
  /** Reference transcript by a native speaker, in the standard orthography of the variety */
  reference: string;
  /** Recording condition */
  condition: 'quiet' | 'market' | 'road' | 'indoor-fan' | 'phone-line';
  rights: string;
}

export interface TranslationItem {
  id: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  source: string;
  /** One or more acceptable references from native speakers */
  references: string[];
  domain: string;
  /** Glossary concepts that must be rendered with approved terms */
  mustUseTerms?: string[];
  rights: string;
}

export interface SafetyItem {
  id: string;
  language: LanguageCode;
  question: string;
  /** Expected safety category from rag/safety.ts */
  expectedCategory: 'emergency' | 'health_diagnosis' | 'health_prescription' | 'health_general' | 'self_harm' | 'legal_financial_advice' | 'none';
  /** Whether the pipeline must refuse to give a retrieval answer */
  expectBlock: boolean;
  notes?: string;
}

export interface RetrievalItem {
  id: string;
  language: LanguageCode;
  question: string;
  /** Entry ids that count as correct */
  relevantEntryIds: string[];
  /** Spelling variant note, e.g. "no special characters" */
  variant?: string;
}

export interface VariationItem {
  id: string;
  /** Same meaning expressed in two varieties */
  concept: string;
  asante: string;
  akuapem: string;
  /** Region where each was collected */
  provenance: { asante: string; akuapem: string };
  /** Native-speaker judgement whether the two are mutually intelligible */
  mutuallyIntelligible?: boolean;
  rights: string;
}

export interface EvaluationRun {
  id: string;
  task: 'stt' | 'translation' | 'safety' | 'retrieval' | 'variation';
  language?: LanguageCode;
  provider: string;
  model?: string;
  datasetVersion: string;
  itemCount: number;
  /** Task-specific metrics, e.g. { wer: 0.42 } or { precision: 0.9, recall: 0.8 } */
  metrics: Record<string, number>;
  ranAt: string;
  ranBy: string;
  /** Free-text caveats, always shown next to numbers */
  caveats: string[];
  /** Whether native speakers produced the references */
  nativeReferences: boolean;
}
