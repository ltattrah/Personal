'use client';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from './SettingsProvider';
import { LanguagePicker } from './LanguagePicker';
import { PushToTalk } from './PushToTalk';
import { AnswerCard } from './AnswerCard';
import { ConsentDialog } from './ConsentDialog';
import { useRecorder } from '@/hooks/useRecorder';
import { useSpeech } from '@/hooks/useSpeech';
import { useOnline } from '@/hooks/useOnline';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';
import type { AskResult } from '@/lib/rag/answer';
import type { LanguageSuggestion } from '@/lib/ai/types';
import { HeuristicLanguageDetector } from '@/lib/ai/language-detect';
import { appendHistory, getSessionId, loadConsent, saveConsent } from '@/lib/client/storage';
import { CONSENT_TEXT_VERSION, hasConsent, setConsent } from '@/lib/privacy/consent';
import { listDownloadedPacks, searchPacks } from '@/lib/client/offline-search';

interface Turn {
  id: string;
  question: string;
  inputMode: 'text' | 'voice';
  transcript?: { text: string; confidence: number | null; provider: string; claimsSupport: boolean | null };
  result?: AskResult;
  error?: string;
  offline?: boolean;
}

const detector = new HeuristicLanguageDetector();

export function AskPanel() {
  const { settings, update, ready } = useSettings();
  const lang = settings.language;
  const online = useOnline();
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<LanguageSuggestion | null>(null);
  const [consentPrompt, setConsentPrompt] = useState<null | { resolve: (v: { store: boolean; days: number }) => void }>(null);
  const recorder = useRecorder(30);
  const speech = useSpeech(settings.allowEnglishVoiceFallback);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [turns.length]);

  // Live language suggestion while typing (client-side heuristic; nothing sent).
  useEffect(() => {
    if (text.trim().split(/\s+/).length < 3) return setSuggestion(null);
    const s = detector.detect(text);
    setSuggestion(s.language && s.language !== lang && LANGUAGES[s.language].group !== LANGUAGES[lang].group ? s : null);
  }, [text, lang]);

  async function submit(question: string, inputMode: 'text' | 'voice', sttConfidence?: number, transcript?: Turn['transcript']) {
    const q = question.trim();
    if (!q) return;
    const id = crypto.randomUUID();
    setTurns((ts) => [...ts, { id, question: q, inputMode, transcript }]);
    setText('');
    setBusy(true);
    try {
      let result: AskResult;
      let offline = false;
      if (online) {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: q, language: lang, inputMode, sttConfidence, sessionId: getSessionId(), region: settings.region }),
        });
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        result = (await res.json()) as AskResult;
      } else {
        const packs = await listDownloadedPacks();
        if (packs.length === 0) throw new Error('You are offline and have no downloaded packs. Open "Offline" when connected to save information for later.');
        result = searchPacks(packs, q, lang);
        offline = true;
      }
      setTurns((ts) => ts.map((tr) => (tr.id === id ? { ...tr, result, offline } : tr)));
      appendHistory({ id, at: new Date().toISOString(), language: lang, question: q, inputMode, result, offline });
      if (inputMode === 'voice' && settings.autoPlay && result.text) void speech.speak(result.text, result.answerLanguage);
    } catch (e) {
      setTurns((ts) => ts.map((tr) => (tr.id === id ? { ...tr, error: e instanceof Error ? e.message : 'Something went wrong' } : tr)));
    } finally {
      setBusy(false);
    }
  }

  async function ensureAudioConsentDecision(): Promise<{ store: boolean; days: number }> {
    const c = loadConsent();
    if (c.records.audioStorage && c.records.audioStorage.textVersion === CONSENT_TEXT_VERSION) {
      return { store: hasConsent(c, 'audioStorage'), days: c.records.audioStorage.retentionDays ?? 7 };
    }
    return new Promise((resolve) => setConsentPrompt({ resolve }));
  }

  async function onRelease() {
    const blob = await recorder.finish();
    if (!blob) return;
    if (!online) {
      setTurns((ts) => [...ts, { id: crypto.randomUUID(), question: '(voice)', inputMode: 'voice', error: 'Voice questions need a connection. Please type your question while offline.' }]);
      return;
    }
    const consent = await ensureAudioConsentDecision();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'question');
      form.append('language', lang);
      form.append('storeConsent', String(consent.store));
      form.append('retentionDays', String(consent.days));
      form.append('consentVersion', CONSENT_TEXT_VERSION);
      form.append('sessionId', getSessionId());
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Could not transcribe the audio');
      const data = (await res.json()) as { text: string; confidence: number | null; provider: string; providerClaimsSupport: boolean | null };
      if (!data.text) throw new Error('No speech was recognised. Please try again or type your question.');
      await submit(data.text, 'voice', data.confidence ?? undefined, { text: data.text, confidence: data.confidence, provider: data.provider, claimsSupport: data.providerClaimsSupport });
    } catch (e) {
      setTurns((ts) => [...ts, { id: crypto.randomUUID(), question: '(voice)', inputMode: 'voice', error: e instanceof Error ? e.message : 'Voice failed' }]);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="flex flex-col gap-4">
      {consentPrompt && (
        <ConsentDialog
          language={lang}
          onDecide={(granted, days, research) => {
            let c = setConsent(loadConsent(), 'audioStorage', granted, days);
            c = setConsent(c, 'audioResearchUse', granted && research, days);
            saveConsent(c);
            consentPrompt.resolve({ store: granted, days });
            setConsentPrompt(null);
          }}
        />
      )}

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <span className="mb-1 block text-xs font-medium text-neutral-600">{t(lang, 'language.label')}</span>
            <LanguagePicker value={lang} onChange={(l) => update({ language: l })} />
          </div>
        </div>
        {LANGUAGES[lang].group === 'ak' && (
          <div className="mt-2 flex gap-2 text-xs" role="group" aria-label="Twi variety">
            {(['ak-asante', 'ak-akuapem'] as LanguageCode[]).map((v) => (
              <button key={v} type="button" onClick={() => update({ language: v })} className={`rounded-full border px-3 py-1 ${lang === v ? 'border-forest-500 bg-forest-50 font-semibold' : 'border-neutral-300'}`}>
                {LANGUAGES[v].autonym}
              </button>
            ))}
          </div>
        )}
      </section>

      <div ref={listRef} className="flex flex-col gap-4">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed border-forest-500/40 p-4 text-sm text-neutral-700">
            <p className="font-medium text-forest-900">Ask about public services, school, farming, or general health information.</p>
            <ul className="mt-2 list-disc pl-5">
              <li>How do I register for the Ghana Card?</li>
              <li>Bere bɛn na medua aburo? (When should I plant maize?)</li>
              <li>Aleke mawɔ awɔ NHIS yeye? (How do I renew NHIS?)</li>
            </ul>
            <p className="mt-2 text-xs text-neutral-500">Answers come only from our reviewed knowledge base and always show their sources. Twi, Ewe and Ga content has not yet been validated by native speakers.</p>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-2">
            <div className="self-end rounded-2xl rounded-br-sm bg-forest-500 px-4 py-2 text-white">
              <p>{turn.question}</p>
              {turn.transcript && (
                <p className="mt-1 text-[11px] opacity-80">
                  Transcribed by {turn.transcript.provider}
                  {turn.transcript.confidence !== null ? ` · confidence ${(turn.transcript.confidence * 100).toFixed(0)}%` : ' · confidence not reported'}
                  {turn.transcript.claimsSupport === false && ' · provider does not claim to support this language: check the words'}
                </p>
              )}
            </div>
            {turn.error && (
              <p role="alert" className="rounded-lg border border-clay-500 bg-orange-50 p-3 text-sm text-clay-700">
                {turn.error}
              </p>
            )}
            {turn.result && (
              <AnswerCard result={turn.result} language={lang} question={turn.question} onSpeak={speech.speak} onStop={speech.stop} playing={speech.playing} offline={turn.offline} />
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-neutral-600" role="status">
            Searching the knowledge base…
          </p>
        )}
        {speech.notice && (
          <p className="text-xs text-clay-700" role="status">
            {speech.notice}
          </p>
        )}
      </div>

      {suggestion?.language && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-gold-50 p-2 text-sm">
          <span>{t(lang, 'language.suggested', { lang: LANGUAGES[suggestion.language].nameEn })}</span>
          <button type="button" className="min-h-[36px] rounded bg-forest-500 px-3 text-white" onClick={() => update({ language: suggestion.language! })}>
            {t(lang, 'language.switch')}
          </button>
          <button type="button" className="min-h-[36px] rounded border px-3" onClick={() => setSuggestion(null)}>
            {t(lang, 'language.keep')}
          </button>
        </div>
      )}

      <form
        className="sticky bottom-16 flex items-end gap-2 rounded-xl bg-white p-2 shadow-md"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, 'text');
        }}
      >
        <label className="sr-only" htmlFor="question">
          {t(lang, 'ask.placeholder')}
        </label>
        <textarea
          id="question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit(text, 'text');
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder={t(lang, 'ask.placeholder')}
          lang={LANGUAGES[lang].providerTag}
          className="min-h-[56px] flex-1 resize-none rounded-lg border border-neutral-300 p-2 focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
        <button type="submit" disabled={busy || !text.trim()} className="min-h-[56px] rounded-lg bg-forest-500 px-4 font-semibold text-white disabled:opacity-50">
          {t(lang, 'ask.send')}
        </button>
        <PushToTalk language={lang} recording={recorder.recording} seconds={recorder.seconds} disabled={busy} onPressStart={() => void recorder.start()} onPressEnd={() => void onRelease()} />
      </form>
      {recorder.error && (
        <p role="alert" className="text-sm text-clay-700">
          {recorder.error}
        </p>
      )}
      {recorder.recording && (
        <p role="status" className="text-center text-sm text-clay-700">
          {t(lang, 'ask.listening')}
        </p>
      )}
    </div>
  );
}
