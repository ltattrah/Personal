import type { AiServices } from '@/lib/ai/registry';
import type { RetrievalIndex } from './retrieve';
import type { GlossaryTerm, KnowledgeEntry, RetrievedPassage, Source } from '@/lib/kb/types';
import { LANGUAGES, describeStatus, type LanguageCode, type SupportStatus } from '@/lib/i18n/languages';
import { assessQuestion, answerViolatesHealthRules, safetyMessage, type SafetyCategory } from './safety';
import { ABSTAIN_THRESHOLD, computeConfidence, type ConfidenceBreakdown } from './confidence';
import { t } from '@/lib/i18n/strings';

export interface Citation {
  entryId: string;
  title: string;
  sources: Source[];
  updatedOn: string;
  reviewBy: string;
  renderingLanguage: LanguageCode;
  nativeReviewed: boolean;
}

export interface AskResult {
  /** 'answer' | 'not_certain' | 'safety' */
  kind: 'answer' | 'not_certain' | 'safety';
  /** Domain of the top cited entry, when any */
  domain?: KnowledgeEntry['domain'];
  language: LanguageCode;
  /** Language the answer text is actually in (may differ when falling back) */
  answerLanguage: LanguageCode;
  text: string;
  title?: string;
  citations: Citation[];
  confidence: ConfidenceBreakdown;
  safety: { category: SafetyCategory; emergencyNumbers: boolean };
  /** Always true when a health entry is involved or health rule fired */
  healthDisclaimer: boolean;
  escalation?: { label: string; phone?: string; url?: string };
  provider: { retrieval: string; answerer: string; model?: string };
  languageStatus: { status: SupportStatus; description: string };
  /** Debug-ish info surfaced to admins in the eval dashboard, not to citizens */
  trace: { passages: { entryId: string; language: LanguageCode; score: number }[]; safetyMatched: string[]; fellBackToExtractive: boolean };
}

export interface AskInput {
  question: string;
  language: LanguageCode;
  sttConfidence?: number;
  domain?: string;
  /** Overrides for tests / organisations */
  languageStatus?: SupportStatus;
  /** Milliseconds before we abandon a hosted LLM and use the extractive fallback */
  llmTimeoutMs?: number;
}

export async function ask(
  input: AskInput,
  deps: { index: RetrievalIndex; services: AiServices; glossary?: GlossaryTerm[]; today?: Date },
): Promise<AskResult> {
  const lang = input.language;
  const languageStatus = input.languageStatus ?? LANGUAGES[lang].defaultStatus;
  const statusInfo = { status: languageStatus, description: describeStatus(languageStatus) };
  const safety = assessQuestion(input.question);

  if (safety.block) {
    const msg = safetyMessage(safety.category, lang);
    return {
      kind: 'safety',
      language: lang,
      answerLanguage: 'en',
      title: msg.title,
      text: msg.body,
      citations: await emergencyCitation(deps.index, safety.category),
      confidence: computeConfidence([], { languageStatus }),
      safety: { category: safety.category, emergencyNumbers: msg.emergencyNumbers },
      healthDisclaimer: true,
      escalation: msg.emergencyNumbers ? { label: 'National emergency line', phone: '112' } : undefined,
      provider: { retrieval: 'rules', answerer: 'rules' },
      languageStatus: statusInfo,
      trace: { passages: [], safetyMatched: safety.matched, fellBackToExtractive: false },
    };
  }

  const passages = await deps.index.search(input.question, { language: lang, topK: 5, domain: input.domain });
  const confidence = computeConfidence(passages, { languageStatus, sttConfidence: input.sttConfidence, today: deps.today });
  const healthInvolved = safety.category === 'health_general' || passages.some((p) => p.entry.domain === 'health');

  if (passages.length === 0 || confidence.score < ABSTAIN_THRESHOLD) {
    return notCertain(lang, passages, confidence, healthInvolved, statusInfo, safety.matched);
  }

  const top = passages[0];
  const glossaryPairs = (deps.glossary ?? [])
    .map((g) => ({ en: g.en, target: g.renderings[lang as Exclude<LanguageCode, 'en'>]?.term }))
    .filter((g): g is { en: string; target: string } => Boolean(g.target));

  let answerer = deps.services.llm;
  let fellBack = false;
  let result;
  try {
    result = await withTimeout(
      answerer.answer({
        question: input.question,
        language: lang,
        passages: passages.slice(0, 3).map((p) => ({ id: p.entry.id, title: p.rendering.title, text: `${p.rendering.summary}\n${p.rendering.body}`, language: p.rendering.language })),
        glossary: glossaryPairs,
        healthMode: healthInvolved,
      }),
      input.llmTimeoutMs ?? 8000,
    );
    if (healthInvolved && !result.abstained) {
      const violation = answerViolatesHealthRules(result.text);
      if (violation) throw new Error(`health rule violation: ${violation}`);
    }
  } catch {
    // Any failure of a hosted model degrades gracefully to the extractive answer.
    fellBack = answerer !== deps.services.fallbackLlm;
    answerer = deps.services.fallbackLlm;
    result = await answerer.answer({
      question: input.question,
      language: lang,
      passages: [{ id: top.entry.id, title: top.rendering.title, text: top.rendering.summary, language: top.rendering.language }],
      healthMode: healthInvolved,
    });
  }

  if (result.abstained) {
    return notCertain(lang, passages, confidence, healthInvolved, statusInfo, safety.matched);
  }

  // Extractive output is the summary of the top passage; hosted models may cite several.
  const usedIds = result.usedPassageIds.length ? result.usedPassageIds : [top.entry.id];
  const used = passages.filter((p) => usedIds.includes(p.entry.id));
  const citations = (used.length ? used : [top]).map(toCitation);
  const answerText = answerer === deps.services.fallbackLlm ? top.rendering.summary : result.text;

  return {
    kind: 'answer',
    domain: top.entry.domain,
    language: lang,
    answerLanguage: answerer === deps.services.fallbackLlm ? top.rendering.language : lang,
    title: top.rendering.title,
    text: answerText,
    citations,
    confidence,
    safety: { category: safety.category, emergencyNumbers: false },
    healthDisclaimer: healthInvolved,
    escalation: top.entry.escalation,
    provider: { retrieval: deps.services.embeddings.name, answerer: result.provider, model: result.model },
    languageStatus: statusInfo,
    trace: { passages: passages.map((p) => ({ entryId: p.entry.id, language: p.rendering.language, score: p.score })), safetyMatched: safety.matched, fellBackToExtractive: fellBack },
  };
}

function notCertain(
  lang: LanguageCode,
  passages: RetrievedPassage[],
  confidence: ConfidenceBreakdown,
  healthInvolved: boolean,
  statusInfo: AskResult['languageStatus'],
  safetyMatched: string[],
): AskResult {
  return {
    kind: 'not_certain',
    domain: passages[0]?.entry.domain,
    language: lang,
    answerLanguage: lang,
    text: t(lang, 'answer.notCertain'),
    // Offer the nearest topics as "you may be looking for" without asserting them as the answer.
    citations: passages.slice(0, 3).map(toCitation),
    confidence: { ...confidence, level: 'low' },
    safety: { category: 'none', emergencyNumbers: false },
    healthDisclaimer: healthInvolved,
    provider: { retrieval: 'hybrid', answerer: 'none' },
    languageStatus: statusInfo,
    trace: { passages: passages.map((p) => ({ entryId: p.entry.id, language: p.rendering.language, score: p.score })), safetyMatched, fellBackToExtractive: false },
  };
}

export function toCitation(p: RetrievedPassage): Citation {
  return {
    entryId: p.entry.id,
    title: p.rendering.title,
    sources: p.entry.sources,
    updatedOn: p.entry.updatedOn,
    reviewBy: p.entry.reviewBy,
    renderingLanguage: p.rendering.language,
    nativeReviewed: p.rendering.nativeReviewed,
  };
}

async function emergencyCitation(index: RetrievalIndex, category: SafetyCategory): Promise<Citation[]> {
  if (category !== 'emergency' && category !== 'self_harm') return [];
  const hits = await index.search('emergency numbers 112 police ambulance', { language: 'en', topK: 1 });
  return hits.map(toCitation);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LLM timeout')), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }, (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export type { KnowledgeEntry };
