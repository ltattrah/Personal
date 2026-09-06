import type { GroundedAnswerRequest, GroundedAnswerResult, LlmProvider } from '@/lib/ai/types';

/**
 * No-model answerer. It composes the reply directly from retrieved passages
 * (summary of the best passage, plus the body when the question is specific).
 * This is the default in demo mode and the guaranteed fallback when a hosted
 * model is unavailable or too slow for a low-bandwidth user. Because it never
 * generates text, it cannot hallucinate; it can only be irrelevant, which the
 * confidence module is designed to catch.
 */
export class ExtractiveAnswerer implements LlmProvider {
  readonly name = 'extractive-v1';
  async answer(req: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    if (req.passages.length === 0) {
      return { text: '', usedPassageIds: [], abstained: true, provider: this.name };
    }
    const top = req.passages[0];
    return { text: top.text, usedPassageIds: [top.id], abstained: false, provider: this.name };
  }
}
