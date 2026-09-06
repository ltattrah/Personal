'use client';
import { useCallback, useRef, useState } from 'react';

/**
 * Push-to-talk recorder. Uses MediaRecorder with Opus where available
 * (small files for 2G/3G). Recording stops automatically at maxSeconds so a
 * stuck button cannot upload minutes of audio.
 */
export function useRecorder(maxSeconds = 30) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice input is not supported in this browser. Please type your question.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', ''].find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecording(false);
        setSeconds(0);
        resolveRef.current?.(blob.size > 0 ? blob : null);
        resolveRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      let s = 0;
      timerRef.current = window.setInterval(() => {
        s += 1;
        setSeconds(s);
        if (s >= maxSeconds) stop();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start the microphone.');
    }
  }, [maxSeconds, stop]);

  /** Resolves with the recorded blob once stop() is called (or auto-stop). */
  const finish = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === 'inactive') return resolve(null);
      resolveRef.current = resolve;
      stop();
    });
  }, [stop]);

  return { recording, error, seconds, start, finish };
}
