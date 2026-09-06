import type { GroundedAnswerRequest } from '@/lib/ai/types';
import { LANGUAGES } from '@/lib/i18n/languages';

/**
 * Shared grounding prompt for hosted LLM providers. The model is a *rewriter*
 * of curated passages, not a source of facts. It must answer in the requested
 * language variety, cite passage ids, and abstain when the passages do not
 * answer the question.
 */
export function buildGroundedPrompt(req: GroundedAnswerRequest): { system: string; user: string } {
  const lang = LANGUAGES[req.language];
  const glossary = (req.glossary ?? []).map((g) => `- "${g.en}" -> "${g.target}"`).join('\n');
  const system = [
    'You are GhanaVoice, a public-information assistant for Ghana.',
    `Answer ONLY using the numbered passages provided. Reply in ${lang.nameEn} (${lang.autonym}).`,
    lang.group === 'ak'
      ? `Use ${lang.autonym} orthography and vocabulary specifically; do not mix Asante and Akuapem forms.`
      : '',
    'Rules:',
    '1. Do not add facts, numbers, dates, prices or procedures that are not in the passages.',
    '2. If the passages do not answer the question, reply with exactly: ABSTAIN',
    '3. Keep the answer short (2-5 sentences) and suitable for reading aloud on a basic phone.',
    '4. End with a line "USED: <comma-separated passage ids>" listing the passages you relied on.',
    req.healthMode
      ? '5. HEALTH MODE: give general information only. Never diagnose, never name a medicine or dose, never tell the user what illness they have. Always advise seeing a health worker.'
      : '',
    glossary ? `Preferred terminology (English -> ${lang.nameEn}):\n${glossary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const passages = req.passages
    .map((p, i) => `[${i + 1}] (id=${p.id}, lang=${p.language}) ${p.title}\n${p.text}`)
    .join('\n\n');
  const user = `Question: ${req.question}\n\nPassages:\n${passages}`;
  return { system, user };
}

export function parseGroundedOutput(raw: string, provider: string, model?: string) {
  const trimmed = raw.trim();
  if (/^ABSTAIN\b/i.test(trimmed)) return { text: '', usedPassageIds: [], abstained: true, provider, model };
  const m = trimmed.match(/\nUSED:\s*(.*)$/i);
  const usedPassageIds = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const text = m ? trimmed.slice(0, m.index).trim() : trimmed;
  return { text, usedPassageIds, abstained: text.length === 0, provider, model };
}
