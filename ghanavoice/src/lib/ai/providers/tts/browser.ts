import type { TtsProvider, TtsRequest, TtsResult } from '@/lib/ai/types';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';

/**
 * Delegates synthesis to the browser's Web Speech API. Costs nothing and works
 * offline, but browsers rarely ship voices for Ghanaian languages, so the
 * client falls back to reading the text with an English voice only when the
 * user explicitly opts in (it will mispronounce). `supports` reflects reality.
 */
export class BrowserTtsProvider implements TtsProvider {
  readonly name = 'browser-tts';
  supports(language: LanguageCode): boolean {
    return LANGUAGES[language].browserTtsLikely;
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    void req;
    return { audio: null, mimeType: 'text/plain', provider: this.name, mode: 'browser' };
  }
}
