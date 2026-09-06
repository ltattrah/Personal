import type { LanguageDetector, LanguageSuggestion } from './types';
import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';
import { normalizeForMatch } from './providers/embeddings/hash-local';

/**
 * Lexicon + orthography heuristic language suggester.
 *
 * This is deliberately simple and transparent. It suggests, it does not
 * decide: the UI always asks the user to confirm a switch. Word lists are
 * high-frequency function words and pronouns. Asante vs Akuapem is separated
 * by a handful of well-known spelling contrasts (e.g. Asante "wo/wobɛ" vs
 * Akuapem "wu/wube", Asante final "-o" vs Akuapem "-ow"), which only fires when
 * the text is already judged to be Akan.
 */
const LEXICON: Record<LanguageCode, string[]> = {
  en: ['the', 'how', 'do', 'i', 'what', 'is', 'where', 'can', 'for', 'to', 'my', 'and', 'of', 'when', 'get', 'register', 'card', 'school', 'farm', 'please', 'help'],
  'ak-asante': ['me', 'wo', 'yɛ', 'na', 'sɛ', 'ne', 'no', 'a', 'mu', 'so', 'dɛn', 'sɛn', 'ho', 'bɛ', 'wɔ', 'ɛhe', 'hwan', 'bere', 'aburo', 'afuo', 'mɛyɛ', 'wobɛtumi', 'nsuo', 'abɔfra'],
  'ak-akuapem': ['me', 'wo', 'yɛ', 'na', 'sɛ', 'ne', 'no', 'a', 'mu', 'so', 'dɛn', 'sɛn', 'ho', 'bɛ', 'wɔ', 'ɛhe', 'hena', 'bere', 'aburow', 'afuw', 'wubetumi', 'nsu', 'abofra', 'wu'],
  ee: ['nye', 'le', 'wò', 'ɖe', 'la', 'be', 'kple', 'me', 'ame', 'aleke', 'afika', 'nukata', 'ɖo', 'ŋu', 'ƒe', 'eye', 'agble', 'suku', 'tsi', 'bli', 'mawɔ', 'àte'],
  gaa: ['mi', 'bo', 'lɛ', 'ni', 'kɛ', 'yɛ', 'mɛni', 'nɛgbɛ', 'te', 'ko', 'aha', 'nɔ', 'mli', 'shi', 'fee', 'skul', 'ŋmɔ', 'nu', 'maŋ', 'gbekɛ', 'obaanyɛ', 'feemɔ'],
};

// Orthographic markers with weights; letters unique to a language are strong evidence.
const CHAR_WEIGHTS: Partial<Record<LanguageCode, Record<string, number>>> = {
  ee: { ɖ: 3, ƒ: 3, ɣ: 3, ʋ: 3, ŋ: 1 },
  gaa: { ŋ: 1.5 },
  'ak-asante': { ɛ: 0.5, ɔ: 0.5 },
  'ak-akuapem': { ɛ: 0.5, ɔ: 0.5 },
};

export class HeuristicLanguageDetector implements LanguageDetector {
  readonly name = 'heuristic-lexicon-v1';

  detect(text: string): LanguageSuggestion {
    const rawTokens = text.toLowerCase().split(/[\s,.!?;:()"]+/).filter(Boolean);
    const normTokens = normalizeForMatch(text).split(' ').filter(Boolean);
    if (rawTokens.length === 0) return { language: null, score: 0, alternatives: [] };

    const scores: Record<LanguageCode, number> = { en: 0, 'ak-asante': 0, 'ak-akuapem': 0, ee: 0, gaa: 0 };

    for (const code of LANGUAGE_CODES) {
      const lex = new Set(LEXICON[code]);
      const lexNorm = new Set(LEXICON[code].map((w) => normalizeForMatch(w)));
      let hits = 0;
      rawTokens.forEach((tok, i) => {
        if (lex.has(tok)) hits += 1;
        else if (lexNorm.has(normTokens[i] ?? '')) hits += 0.6; // matched after folding ɛ/ɔ -> e/o
      });
      let charScore = 0;
      const weights = CHAR_WEIGHTS[code];
      if (weights) for (const ch of text) charScore += weights[ch] ?? 0;
      scores[code] = hits / rawTokens.length + Math.min(charScore, 3) / rawTokens.length;
    }

    // Digits and Latin-only words that appear in every language should not pull toward English.
    const ranked = LANGUAGE_CODES.map((l) => ({ language: l, score: round(scores[l]) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best.score < 0.15) return { language: null, score: best.score, alternatives: ranked.slice(0, 3) };

    // Akan tie-break: Asante vs Akuapem differ only on a few forms; if scores are
    // within a small margin we return the Asante code but keep Akuapem as an alternative.
    if (LANGUAGES[best.language].group === 'ak') {
      const asante = scores['ak-asante'];
      const akuapem = scores['ak-akuapem'];
      const winner: LanguageCode = akuapem > asante ? 'ak-akuapem' : 'ak-asante';
      return { language: winner, score: round(Math.max(asante, akuapem)), alternatives: ranked.slice(0, 3) };
    }
    return { language: best.language, score: best.score, alternatives: ranked.slice(0, 3) };
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
