'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LanguageCode } from '@/lib/i18n/languages';
import { LANGUAGES } from '@/lib/i18n/languages';

/**
 * Audio playback for answers. Tries the server TTS route; if the server says
 * "browser", uses the Web Speech API when a matching voice exists. For
 * Ghanaian languages browsers have no voices, so playback is only offered
 * when the user explicitly allowed the English-voice fallback in settings.
 */
export function useSpeech(allowEnglishVoiceFallback: boolean) {
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string, language: LanguageCode) => {
      stop();
      setNotice(null);
      try {
        const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language }) });
        if (res.ok && res.headers.get('content-type')?.startsWith('audio/')) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          audio.onended = () => setPlaying(false);
          setPlaying(true);
          await audio.play();
          return;
        }
      } catch {
        /* fall through to browser synthesis */
      }
      if (typeof speechSynthesis === 'undefined') {
        setNotice('Audio playback is not available on this device.');
        return;
      }
      const tag = LANGUAGES[language].providerTag;
      const voices = speechSynthesis.getVoices();
      const voice = voices.find((v) => v.lang.toLowerCase().startsWith(tag.toLowerCase().split('-')[0]));
      if (!voice && language !== 'en' && !allowEnglishVoiceFallback) {
        setNotice(`No ${LANGUAGES[language].nameEn} voice is available on this device. You can allow an English voice in Settings (it will mispronounce words).`);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'en-GB';
      u.rate = 0.95;
      u.onend = () => setPlaying(false);
      setPlaying(true);
      speechSynthesis.speak(u);
    },
    [allowEnglishVoiceFallback, stop],
  );

  return { speak, stop, playing, notice };
}
