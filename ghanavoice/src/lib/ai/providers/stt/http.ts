import type { SttProvider, SttRequest, SttResult } from '@/lib/ai/types';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';

/**
 * Generic HTTP adapter for any speech-to-text endpoint, e.g. a self-hosted
 * fine-tuned Whisper/wav2vec model for Akan, Ewe or Ga (see docs/05 for the
 * expected contract). Request: multipart/form-data with `audio` and `language`.
 * Response JSON: { text: string, confidence?: number, language?: string }.
 */
export class HttpSttProvider implements SttProvider {
  readonly name: string;
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly supported: LanguageCode[] = ['en', 'ak-asante', 'ak-akuapem', 'ee', 'gaa'],
    name = 'http-stt',
  ) {
    this.name = name;
  }
  supports(language: LanguageCode): boolean {
    return this.supported.includes(language);
  }
  async transcribe(req: SttRequest): Promise<SttResult> {
    const form = new FormData();
    form.append('audio', new Blob([req.audio], { type: req.mimeType }), 'audio');
    if (req.language) {
      form.append('language', LANGUAGES[req.language].providerTag);
      form.append('variety', req.language);
    }
    const started = Date.now();
    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`STT endpoint returned ${res.status}`);
    const data = (await res.json()) as { text?: string; confidence?: number; language?: string; model?: string };
    return {
      text: (data.text ?? '').trim(),
      confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : undefined,
      detectedLanguage: data.language,
      provider: this.name,
      model: data.model,
      durationMs: Date.now() - started,
    };
  }
}
