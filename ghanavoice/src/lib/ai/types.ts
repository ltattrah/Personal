import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Provider-agnostic AI service contracts.
 *
 * Every capability is an interface with a `name` so that evaluation runs can
 * record exactly which provider/model produced each output. Implementations
 * live in ./providers and are selected in ./registry.ts from environment
 * variables, so swapping a provider is a config change, not a code change.
 */

export interface SttRequest {
  audio: ArrayBuffer;
  mimeType: string;
  /** Language hint chosen by the user; providers may ignore it */
  language?: LanguageCode;
}

export interface SttResult {
  text: string;
  /** Provider-reported confidence 0..1 if available; undefined means unknown, never fabricate */
  confidence?: number;
  /** Language the provider believes it heard, if reported */
  detectedLanguage?: string;
  provider: string;
  model?: string;
  durationMs?: number;
}

export interface SttProvider {
  readonly name: string;
  /** Languages the provider claims to support. Claims are not the same as evaluated quality. */
  supports(language: LanguageCode): boolean;
  transcribe(req: SttRequest): Promise<SttResult>;
}

export interface TtsRequest {
  text: string;
  language: LanguageCode;
  /** Optional voice identifier understood by the provider */
  voice?: string;
}

export interface TtsResult {
  /** null when the provider delegates to the browser (Web Speech API) */
  audio: ArrayBuffer | null;
  mimeType: string;
  provider: string;
  /** 'server' audio bytes or 'browser' instruction to synthesise client-side */
  mode: 'server' | 'browser';
}

export interface TtsProvider {
  readonly name: string;
  supports(language: LanguageCode): boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface GroundedPassage {
  id: string;
  title: string;
  text: string;
  language: LanguageCode;
}

export interface GroundedAnswerRequest {
  question: string;
  language: LanguageCode;
  passages: GroundedPassage[];
  /** Glossary terms the model should prefer (approved terminology) */
  glossary?: { en: string; target: string }[];
  /** When true the model must add no medical advice beyond the passages */
  healthMode?: boolean;
}

export interface GroundedAnswerResult {
  /** Plain-text answer composed only from the passages */
  text: string;
  /** IDs of passages actually used, as reported by the model or extractor */
  usedPassageIds: string[];
  /** True when the provider could not answer from the passages */
  abstained: boolean;
  provider: string;
  model?: string;
}

export interface LlmProvider {
  readonly name: string;
  answer(req: GroundedAnswerRequest): Promise<GroundedAnswerResult>;
}

export interface LanguageSuggestion {
  language: LanguageCode | null;
  /** 0..1 heuristic score; not a calibrated probability */
  score: number;
  /** Runner-up candidates for the UI to offer */
  alternatives: { language: LanguageCode; score: number }[];
}

export interface LanguageDetector {
  readonly name: string;
  detect(text: string): LanguageSuggestion;
}
