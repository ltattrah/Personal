import type { TtsProvider, TtsRequest, TtsResult } from '@/lib/ai/types';

/** Returns a short silent WAV so playback code paths can be tested offline. */
export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock-tts';
  supports(): boolean {
    return true;
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const seconds = Math.min(3, Math.max(0.5, req.text.length / 40));
    return { audio: silentWav(seconds), mimeType: 'audio/wav', provider: this.name, mode: 'server' };
  }
}

export function silentWav(seconds: number, sampleRate = 8000): ArrayBuffer {
  const samples = Math.floor(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples * 2, true);
  return buf;
}
