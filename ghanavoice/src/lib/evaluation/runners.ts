import type { RetrievalIndex } from '@/lib/rag/retrieve';
import { assessQuestion } from '@/lib/rag/safety';
import type { EvaluationRun, RetrievalItem, SafetyItem } from './types';

/**
 * Runners for the two tasks that need no human-produced audio or references:
 * the rule-based safety classifier and retrieval hit rate over the curated
 * corpus. STT and translation runs are produced by evaluation/scripts and
 * recorded via the admin API; they cannot be computed here honestly.
 */
export function runSafetyEval(items: SafetyItem[], datasetVersion: string, ranBy = 'system'): EvaluationRun & { failures: { id: string; expected: string; got: string }[] } {
  let correctCategory = 0;
  let correctBlock = 0;
  let blockedWhenShouldNot = 0;
  let notBlockedWhenShould = 0;
  const failures: { id: string; expected: string; got: string }[] = [];
  for (const item of items) {
    const a = assessQuestion(item.question);
    if (a.category === item.expectedCategory) correctCategory++;
    else failures.push({ id: item.id, expected: item.expectedCategory, got: a.category });
    if (a.block === item.expectBlock) correctBlock++;
    else if (a.block) blockedWhenShouldNot++;
    else notBlockedWhenShould++;
  }
  const n = Math.max(1, items.length);
  return {
    id: `safety-${Date.now()}`,
    task: 'safety',
    provider: 'rules',
    datasetVersion,
    itemCount: items.length,
    metrics: {
      categoryAccuracy: round(correctCategory / n),
      blockAccuracy: round(correctBlock / n),
      overBlockRate: round(blockedWhenShouldNot / n),
      underBlockRate: round(notBlockedWhenShould / n),
    },
    ranAt: new Date().toISOString(),
    ranBy,
    caveats: [
      'Measures the rule-based classifier on a small curated set; not a measure of real-world unsafe-answer rate.',
      'Ghanaian-language safety phrases are drafts pending native-speaker review.',
    ],
    nativeReferences: false,
    failures,
  };
}

export async function runRetrievalEval(index: RetrievalIndex, items: RetrievalItem[], datasetVersion: string, ranBy = 'system') {
  let hit1 = 0;
  let hit3 = 0;
  let mrr = 0;
  const byLanguage: Record<string, { n: number; hit1: number }> = {};
  const failures: { id: string; language: string; got: string[] }[] = [];
  for (const item of items) {
    const res = await index.search(item.question, { language: item.language, topK: 3 });
    const ids = res.map((r) => r.entry.id);
    const rank = ids.findIndex((id) => item.relevantEntryIds.includes(id));
    byLanguage[item.language] ??= { n: 0, hit1: 0 };
    byLanguage[item.language].n++;
    if (rank === 0) {
      hit1++;
      byLanguage[item.language].hit1++;
    }
    if (rank >= 0) {
      hit3++;
      mrr += 1 / (rank + 1);
    } else failures.push({ id: item.id, language: item.language, got: ids });
  }
  const n = Math.max(1, items.length);
  const run: EvaluationRun & { byLanguage: Record<string, number>; failures: typeof failures } = {
    id: `retrieval-${Date.now()}`,
    task: 'retrieval',
    provider: 'hybrid-bm25+embedding',
    datasetVersion,
    itemCount: items.length,
    metrics: { hitAt1: round(hit1 / n), hitAt3: round(hit3 / n), mrr: round(mrr / n) },
    ranAt: new Date().toISOString(),
    ranBy,
    caveats: ['Questions were written by the engineering team, not collected from citizens; expect lower real-world scores.'],
    nativeReferences: false,
    byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([l, v]) => [l, round(v.hit1 / v.n)])),
    failures,
  };
  return run;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
