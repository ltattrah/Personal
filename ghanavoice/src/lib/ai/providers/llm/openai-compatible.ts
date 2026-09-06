import type { GroundedAnswerRequest, GroundedAnswerResult, LlmProvider } from '@/lib/ai/types';
import { buildGroundedPrompt, parseGroundedOutput } from './prompt';

/** Works with OpenAI, Azure OpenAI, vLLM, Ollama and other chat-completions-compatible servers. */
export class OpenAiCompatibleAnswerer implements LlmProvider {
  readonly name = 'openai-compatible';
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}
  async answer(req: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    const { system, user } = buildGroundedPrompt(req);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Chat completions returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return parseGroundedOutput(data.choices[0]?.message?.content ?? '', this.name, this.model);
  }
}
