/**
 * Language and variety model for GhanaVoice.
 *
 * Codes follow BCP-47 where possible. ISO 639-3 / BCP-47 primary subtags:
 *   - Akan/Twi:  "ak" (macro), varieties "tw" (Twi). We model the two written
 *                standards, Asante Twi and Akuapem Twi, as distinct varieties
 *                because orthography, vocabulary and some grammar differ and
 *                the knowledge base must be able to store both.
 *   - Ewe:       "ee"
 *   - Ga:        "gaa"
 *   - English:   "en" (Ghanaian English; we do not currently store a variety)
 *
 * Support status is data, not marketing: a variety is only "evaluated" once the
 * native-speaker validation plan (docs/07) has been executed and results are
 * stored in evaluation_runs. Until then the UI must show the honest status.
 */

export type LanguageCode = 'en' | 'ak-asante' | 'ak-akuapem' | 'ee' | 'gaa';

/** A user may pick "Twi" without knowing the standard; we then default to Asante and offer the toggle. */
export type LanguageGroup = 'en' | 'ak' | 'ee' | 'gaa';

export type SupportStatus =
  | 'evaluated' // Validated by native speakers per docs/07; metrics recorded.
  | 'experimental' // Content exists; not validated. UI shows a warning.
  | 'unevaluated'; // No validated content; text input accepted but answers fall back to English.

export interface LanguageDefinition {
  code: LanguageCode;
  group: LanguageGroup;
  /** Name in English */
  nameEn: string;
  /** Autonym (name in the language itself) */
  autonym: string;
  /** Regions in Ghana where this variety is predominant (informational) */
  regions: string[];
  /** BCP-47 tag to hand to speech providers; may be the macro-language when the provider lacks variety support */
  providerTag: string;
  /** Whether Web Speech / browser TTS is realistically available. Almost never for Ghanaian languages. */
  browserTtsLikely: boolean;
  /** Characters outside ASCII commonly used in the orthography; used for language suggestion */
  specialChars: string[];
  /** Default status before any evaluation run; overridden at runtime from the evaluation store */
  defaultStatus: SupportStatus;
}

export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = {
  en: {
    code: 'en',
    group: 'en',
    nameEn: 'English',
    autonym: 'English',
    regions: ['Nationwide'],
    providerTag: 'en-GH',
    browserTtsLikely: true,
    specialChars: [],
    defaultStatus: 'experimental',
  },
  'ak-asante': {
    code: 'ak-asante',
    group: 'ak',
    nameEn: 'Twi (Asante)',
    autonym: 'Asante Twi',
    regions: ['Ashanti', 'Bono', 'Bono East', 'Ahafo'],
    providerTag: 'ak',
    browserTtsLikely: false,
    specialChars: ['ɛ', 'ɔ', 'Ɛ', 'Ɔ'],
    defaultStatus: 'experimental',
  },
  'ak-akuapem': {
    code: 'ak-akuapem',
    group: 'ak',
    nameEn: 'Twi (Akuapem)',
    autonym: 'Akuapem Twi',
    regions: ['Eastern'],
    providerTag: 'ak',
    browserTtsLikely: false,
    specialChars: ['ɛ', 'ɔ', 'Ɛ', 'Ɔ'],
    defaultStatus: 'experimental',
  },
  ee: {
    code: 'ee',
    group: 'ee',
    nameEn: 'Ewe',
    autonym: 'Eʋegbe',
    regions: ['Volta', 'Oti'],
    providerTag: 'ee',
    browserTtsLikely: false,
    specialChars: ['ɖ', 'ƒ', 'ɣ', 'ŋ', 'ʋ', 'ɛ', 'ɔ', 'Ɖ', 'Ƒ', 'Ɣ', 'Ŋ', 'Ʋ', 'Ɛ', 'Ɔ'],
    defaultStatus: 'experimental',
  },
  gaa: {
    code: 'gaa',
    group: 'gaa',
    nameEn: 'Ga',
    autonym: 'Gã',
    regions: ['Greater Accra'],
    providerTag: 'gaa',
    browserTtsLikely: false,
    specialChars: ['ɛ', 'ɔ', 'ŋ', 'Ɛ', 'Ɔ', 'Ŋ'],
    defaultStatus: 'experimental',
  },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES;
}

export function groupOf(code: LanguageCode): LanguageGroup {
  return LANGUAGES[code].group;
}

/** Sister variety within the same group (Asante <-> Akuapem). */
export function sisterVarieties(code: LanguageCode): LanguageCode[] {
  const g = groupOf(code);
  return LANGUAGE_CODES.filter((c) => c !== code && LANGUAGES[c].group === g);
}

/**
 * Order in which we look for content when the exact variety is missing.
 * We never silently present a sister variety as the requested one; the caller
 * must label the fallback (see rag/answer.ts).
 */
export function fallbackChain(code: LanguageCode): LanguageCode[] {
  const chain: LanguageCode[] = [code, ...sisterVarieties(code), 'en'];
  return chain.filter((c, i, arr) => arr.indexOf(c) === i);
}

export function describeStatus(status: SupportStatus): string {
  switch (status) {
    case 'evaluated':
      return 'Validated by native speakers';
    case 'experimental':
      return 'Experimental: not yet validated by native speakers';
    case 'unevaluated':
      return 'Not evaluated: answers will be in English';
  }
}
