import type { SttProvider, SttRequest, SttResult } from '@/lib/ai/types';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * OpenAI-compatible transcription endpoint (/audio/transcriptions).
 * Whisper-family models have English support and, at the time of writing, no
 * verified support for Akan, Ewe or Ga. We therefore only claim English here;
 * other languages are passed through without a language hint and the caller
 * shows the "experimental" label. Do not upgrade `supports` without an
 * evaluation run (docs/06).
 */
export class OpenAiSttProvider implements SttProvider {
  readonly name = 'openai-stt';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
    private readonly model = 'whisper-1',
  ) {}
  supports(language: LanguageCode): boolean {
    return language === 'en';
  }
  async transcribe(req: SttRequest): Promise<SttResult> {
    const form = new FormData();
    form.append('file', new Blob([req.audio], { type: req.mimeType }), 'audio.webm');
    form.append('model', this.model);
    if (req.language === 'en') form.append('language', 'en');
    form.append('response_format', 'verbose_json');
    const started = Date.now();
    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI STT returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text: string; language?: string; segments?: { avg_logprob?: number }[] };
    // Whisper does not return a calibrated confidence. We expose the mean
    // segment log-probability mapped to 0..1 only as a rough indicator.
    let confidence: number | undefined;
    if (data.segments?.length) {
      const lp = data.segments.map((s) => s.avg_logprob ?? -1);
      const mean = lp.reduce((a, b) => a + b, 0) / lp.length;
      confidence = Math.max(0, Math.min(1, Math.exp(mean)));
    }
    return {
      text: data.text.trim(),
      confidence,
      detectedLanguage: data.language,
      provider: this.name,
      model: this.model,
      durationMs: Date.now() - started,
    };
  }
}
