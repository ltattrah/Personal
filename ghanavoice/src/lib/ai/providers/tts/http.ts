import type { TtsProvider, TtsRequest, TtsResult } from '@/lib/ai/types';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Generic HTTP adapter for a TTS endpoint (e.g. a self-hosted Twi/Ewe/Ga
 * voice). POST JSON { text, language, variety, voice } -> audio bytes.
 */
export class HttpTtsProvider implements TtsProvider {
  readonly name: string;
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly supported: LanguageCode[] = ['en'],
    name = 'http-tts',
  ) {
    this.name = name;
  }
  supports(language: LanguageCode): boolean {
    return this.supported.includes(language);
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify({ text: req.text, language: req.language.split('-')[0], variety: req.language, voice: req.voice }),
    });
    if (!res.ok) throw new Error(`TTS endpoint returned ${res.status}`);
    return {
      audio: await res.arrayBuffer(),
      mimeType: res.headers.get('content-type') ?? 'audio/mpeg',
      provider: this.name,
      mode: 'server',
    };
  }
}
