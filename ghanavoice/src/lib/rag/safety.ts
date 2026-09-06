import type { LanguageCode } from '@/lib/i18n/languages';
import { normalizeForMatch } from '@/lib/ai/providers/embeddings/hash-local';

/**
 * Rule-based safety layer. Runs BEFORE retrieval (on the question) and AFTER
 * generation (on the answer). Rules are transparent and testable; they are the
 * floor, not the ceiling: evaluation datasets (evaluation/datasets/safety_*)
 * track how often they fire correctly.
 */

export type SafetyCategory =
  | 'emergency' // Someone may be in immediate danger: show emergency numbers first.
  | 'health_diagnosis' // "What illness do I have?" -> refuse to diagnose, redirect.
  | 'health_prescription' // "What medicine/dose should I take?" -> refuse to prescribe, redirect.
  | 'health_general' // Health topic, general information allowed with disclaimer.
  | 'self_harm' // Crisis: redirect to human help.
  | 'legal_financial_advice' // Personal legal/financial decisions: general info + disclaimer.
  | 'none';

export interface SafetyAssessment {
  category: SafetyCategory;
  /** When true the pipeline must not produce a retrieval answer; it returns the redirect text instead */
  block: boolean;
  /** Human-readable reason recorded in analytics (never the user's text) */
  reason: string;
  matched: string[];
}

interface Rule {
  category: SafetyCategory;
  block: boolean;
  patterns: RegExp[];
}

// Patterns operate on normalised text (lowercase, special letters folded).
// Ghanaian-language terms are drafts pending native-speaker review (docs/07).
const RULES: Rule[] = [
  {
    category: 'emergency',
    block: true,
    patterns: [
      /\b(not breathing|unconscious|collapsed|bleeding heavily|heavy bleeding|severe bleeding|choking|drowning|overdose|poison(ed|ing)?|snake ?bite|house (is )?on fire|fire outbreak|armed robber|being attacked|stabbed|shot|car crash|accident (right )?now|convuls(ing|ion)|fits? now|labou?r pains?|giving birth now)\b/,
      // Akan: "onnhome" (not breathing), "ogya adi" (fire), "asa (afu)" ; Ewe: "dzo bi" (fire) ; Ga: "la eshwie" (fire) - drafts
      /\b(onnhome|ogya adi|ogya ahye|dzo bi|la eshwie|mogya reguan|akwanhyia seesei)\b/,
    ],
  },
  {
    category: 'self_harm',
    block: true,
    patterns: [/\b(kill myself|end my life|suicide|want to die|hurt myself|no reason to live)\b/],
  },
  {
    category: 'health_prescription',
    block: true,
    patterns: [
      /\b(what|which|how much|how many)\b.*\b(medicine|medication|drug|tablet|pill|dose|dosage|antibiotic|paracetamol|amoxicillin|artemether|coartem|injection)\b/,
      /\b(should i|can i|do i|should we|can we)\b.*\b(take|use|give|swallow|drink)\b.*\b(medicine|medication|drug|tablets?|pills?|antibiotics?|herbs?|herbal|paracetamol|amoxicillin|artemether|coartem|ibuprofen|aspirin|injection|aduru|atike|tsofa)\b/,
      /\b(prescribe|prescription)\b/,
      /\b(aduru bɛn|aduru ben|aduru sen|atike ka|atike kae|tsofa te)\b/,
    ],
  },
  {
    category: 'health_diagnosis',
    block: true,
    patterns: [
      /\b(do i have|does (my|the) (child|baby|wife|husband|mother|father|son|daughter) have|is (it|this) (malaria|typhoid|cholera|covid|hiv|aids|cancer|diabetes|hypertension|tuberculosis|tb)|what (disease|illness|sickness) (do i|does .* )have|diagnos(e|is)|what is wrong with (me|my))\b/,
      /\b(mewɔ atiridii|mewo atiridii|yare ben na mewo|yare bɛn na mewɔ|asrã le nunye|dɔ ka le nunye|hela ko mli)\b/,
    ],
  },
  {
    category: 'health_general',
    block: false,
    patterns: [
      /\b(malaria|fever|cholera|diarrhoea|diarrhea|vaccines?|vaccinations?|immuni[sz]ations?|hospitals?|clinics?|nhis|health|sick|illness|pregnan(t|cy)|mosquito(es)?|hiv|typhoid|covid|antenatal|nurses?|doctors?|medicines?)\b/,
      /\b(atiridii|atridii|asrã|asra|ayaresabea|kodzi|helatsamohe|yare|dolele|hela|apemfo|ntontom)\b/,
    ],
  },
  {
    category: 'legal_financial_advice',
    block: false,
    patterns: [/\b(should i (sue|sign|invest|borrow|take a loan)|is it legal for me|my lawyer|court case against|which bank should)\b/],
  },
];

export function assessQuestion(question: string): SafetyAssessment {
  const norm = normalizeForMatch(question);
  for (const rule of RULES) {
    const matched: string[] = [];
    for (const p of rule.patterns) {
      const m = norm.match(p);
      if (m) matched.push(m[0]);
    }
    if (matched.length) {
      return { category: rule.category, block: rule.block, reason: `rule:${rule.category}`, matched };
    }
  }
  return { category: 'none', block: false, reason: 'none', matched: [] };
}

/**
 * Post-generation check for hosted LLM output in health mode: reject answers
 * that name doses or specific medicines, or that assert a diagnosis. The
 * extractive answerer never produces these because curated content is
 * screened at review time, but a rewriter model could.
 */
export function answerViolatesHealthRules(answer: string): string | null {
  const norm = normalizeForMatch(answer);
  if (/\b\d+\s?(mg|ml|milligram|tablets?|pills?)\b/.test(norm)) return 'dose_mentioned';
  if (/\byou (have|are suffering from|probably have|likely have|may have|might have) (malaria|typhoid|cholera|covid|hiv|aids|cancer|diabetes|hypertension|tuberculosis|tb|pneumonia|an? (infection|disease|illness))\b/.test(norm)) return 'diagnosis_asserted';
  if (/\b(take|swallow|use)\b.*\b(paracetamol|amoxicillin|coartem|artemether|ibuprofen|antibiotic)\b/.test(norm)) return 'medicine_recommended';
  return null;
}

export interface SafetyMessage {
  title: string;
  body: string;
  emergencyNumbers: boolean;
}

/**
 * Redirect text for blocked categories. Only English has been drafted by the
 * team; other languages fall back to English plus the (draft) short string in
 * i18n/strings.ts until native speakers validate full texts.
 */
export function safetyMessage(category: SafetyCategory, language: LanguageCode): SafetyMessage {
  void language;
  switch (category) {
    case 'emergency':
      return {
        title: 'This may be an emergency',
        body: 'Call 112 now (national emergency line). You can also call 191 for police, 192 for fire service or 193 for ambulance. Tell them where you are and what has happened. GhanaVoice cannot send help.',
        emergencyNumbers: true,
      };
    case 'self_harm':
      return {
        title: 'You deserve support right now',
        body: 'Please talk to someone you trust or go to the nearest health facility. In an emergency call 112. GhanaVoice is an information service and cannot provide counselling, but a health worker or a religious or community leader you trust can help you get support.',
        emergencyNumbers: true,
      };
    case 'health_diagnosis':
      return {
        title: 'I cannot tell you what illness someone has',
        body: 'Only a trained health worker who examines the person can do that. Please go to the nearest CHPS compound, clinic or hospital, especially for a child, a pregnant woman or an older person. If the person is very weak, has trouble breathing or a fit, call 112 now. I can share general prevention information if that helps.',
        emergencyNumbers: false,
      };
    case 'health_prescription':
      return {
        title: 'I cannot recommend medicines or doses',
        body: 'Medicines, including herbal ones, can be harmful in the wrong situation. Please ask a pharmacist, nurse or doctor, who can check the person and the correct dose. NHIS covers many treatments at accredited facilities. I can share general information about prevention and where to get care.',
        emergencyNumbers: false,
      };
    default:
      return { title: '', body: '', emergencyNumbers: false };
  }
}
