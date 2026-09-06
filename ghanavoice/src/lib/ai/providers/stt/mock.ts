import type { SttProvider, SttRequest, SttResult } from '@/lib/ai/types';
import type { LanguageCode } from '@/lib/i18n/languages';

/**
 * Deterministic mock used in demo mode and tests. It does not recognise
 * speech. It returns a fixed phrase per language so the UI flow can be
 * exercised end-to-end without any external service. The UI labels the result
 * as coming from the mock provider.
 */
const PHRASES: Record<LanguageCode, string> = {
  en: 'How do I register for the Ghana Card?',
  'ak-asante': 'Mɛyɛ dɛn akyerɛw me din agye Ghana Card?',
  'ak-akuapem': 'Mɛyɛ dɛn makyerɛw me din agye Ghana Card?',
  ee: 'Aleke mawɔ aŋlɔ ŋkɔ axɔ Ghana Card?',
  gaa: 'Mɛni feemɔ maŋmaa migbɛi kɛ Ghana Card?',
};

export class MockSttProvider implements SttProvider {
  readonly name = 'mock-stt';
  supports(): boolean {
    return true;
  }
  async transcribe(req: SttRequest): Promise<SttResult> {
    const lang = req.language ?? 'en';
    return {
      text: PHRASES[lang],
      confidence: undefined, // The mock has no real confidence; never invent one.
      provider: this.name,
      durationMs: 0,
    };
  }
}
