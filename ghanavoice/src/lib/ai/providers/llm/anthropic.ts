import type { GroundedAnswerRequest, GroundedAnswerResult, LlmProvider } from '@/lib/ai/types';
import { buildGroundedPrompt, parseGroundedOutput } from './prompt';

/** Anthropic Messages API adapter (no SDK dependency to keep the bundle small). */
export class AnthropicAnswerer implements LlmProvider {
  readonly name = 'anthropic';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-sonnet-5',
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}
  async answer(req: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    const { system, user } = buildGroundedPrompt(req);
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 400,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.map((c) => c.text ?? '').join('');
    return parseGroundedOutput(text, this.name, this.model);
  }
}
