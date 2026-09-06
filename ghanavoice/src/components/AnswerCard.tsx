'use client';
import { useState } from 'react';
import type { AskResult } from '@/lib/rag/answer';
import type { LanguageCode } from '@/lib/i18n/languages';
import { LANGUAGES } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Citations } from './Citations';
import { EmergencyBox, HealthDisclaimer } from './Disclaimer';
import { getSessionId } from '@/lib/client/storage';

interface Props {
  result: AskResult;
  language: LanguageCode;
  question: string;
  onSpeak?: (text: string, lang: LanguageCode) => void;
  onStop?: () => void;
  playing?: boolean;
  offline?: boolean;
}

export function AnswerCard({ result, language, question, onSpeak, onStop, playing, offline }: Props) {
  const [fb, setFb] = useState<'sent' | 'form' | null>(null);
  const [issue, setIssue] = useState<'translation' | 'wrong' | 'outdated' | 'unsafe' | 'other'>('translation');
  const [suggestion, setSuggestion] = useState('');
  const [escalation, setEscalation] = useState<{ reference: string; contact: { label: string; phone?: string; url?: string } } | null>(null);
  const [escalating, setEscalating] = useState(false);

  async function sendFeedback(rating?: 'helpful' | 'not_helpful', withIssue?: boolean) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          language,
          rating,
          issue: withIssue ? issue : undefined,
          entryIds: result.citations.map((c) => c.entryId),
          suggestedText: withIssue && suggestion ? suggestion : undefined,
          sessionId: getSessionId(),
        }),
      });
    } catch {
      /* offline: feedback is best-effort */
    }
    setFb('sent');
  }

  async function escalate() {
    setEscalating(true);
    try {
      const domain = result.citations[0]?.entryId ? guessDomain(result.citations[0].entryId) : 'other';
      const res = await fetch('/api/escalate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language, domain, entryIds: result.citations.map((c) => c.entryId), question, contact: { method: 'none' }, sessionId: getSessionId() }),
      });
      if (res.ok) setEscalation(await res.json());
    } finally {
      setEscalating(false);
    }
  }

  const answerLangDiffers = result.answerLanguage !== language;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm" aria-live="polite">
      {result.kind === 'safety' && result.safety.emergencyNumbers && <EmergencyBox />}
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {result.title && <h2 className="text-lg font-semibold text-forest-900">{result.title}</h2>}
        <ConfidenceBadge confidence={result.confidence} language={language} />
      </header>
      {answerLangDiffers && (
        <p className="mb-2 text-xs text-clay-700">
          Shown in {LANGUAGES[result.answerLanguage].nameEn} because no {LANGUAGES[language].nameEn} version is available yet.
        </p>
      )}
      {offline && <p className="mb-2 text-xs text-neutral-600">Answered offline from a downloaded pack.</p>}
      <p className="whitespace-pre-line text-base leading-relaxed text-neutral-900">{result.text}</p>
      {result.healthDisclaimer && <HealthDisclaimer />}

      <div className="mt-3 flex flex-wrap gap-2">
        {onSpeak && result.text && (
          <button
            type="button"
            onClick={() => (playing ? onStop?.() : onSpeak(result.text, result.answerLanguage))}
            className="min-h-[44px] rounded-lg border border-forest-500 px-3 text-sm font-medium text-forest-700 hover:bg-forest-50"
          >
            {playing ? `■ ${t(language, 'answer.stop')}` : `▶ ${t(language, 'answer.play')}`}
          </button>
        )}
        <button
          type="button"
          onClick={escalate}
          disabled={escalating || !!escalation}
          className="min-h-[44px] rounded-lg border border-gold-500 bg-gold-50 px-3 text-sm font-medium text-gold-700 hover:bg-gold-100 disabled:opacity-60"
        >
          {t(language, 'answer.escalate')}
        </button>
        {result.escalation?.phone && (
          <a href={`tel:${result.escalation.phone}`} className="inline-flex min-h-[44px] items-center rounded-lg bg-clay-500 px-3 text-sm font-semibold text-white">
            Call {result.escalation.phone}
          </a>
        )}
      </div>

      {escalation && (
        <div className="mt-3 rounded-lg bg-forest-50 p-3 text-sm">
          <p className="font-semibold text-forest-900">Reference {escalation.reference}</p>
          <p>Contact: {escalation.contact.label}</p>
          {escalation.contact.phone && (
            <a className="underline" href={`tel:${escalation.contact.phone}`}>
              Call {escalation.contact.phone}
            </a>
          )}
          {escalation.contact.url && (
            <a className="ml-2 underline" href={escalation.contact.url} target="_blank" rel="noreferrer noopener">
              Website
            </a>
          )}
          <p className="mt-1 text-xs text-neutral-600">Quote the reference number when you contact them. Your question was shared with the partner desk because you asked for a person.</p>
        </div>
      )}

      {result.kind !== 'safety' && (
        <Citations citations={result.citations} language={language} heading={result.kind === 'not_certain' ? 'You may be looking for' : undefined} />
      )}
      {result.kind === 'safety' && result.citations.length > 0 && <Citations citations={result.citations} language={language} />}

      <footer className="mt-3 border-t border-neutral-100 pt-2 text-sm">
        {fb === 'sent' ? (
          <p className="text-forest-700">Thank you. Your feedback helps reviewers improve this content.</p>
        ) : fb === 'form' ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendFeedback('not_helpful', true);
            }}
          >
            <label className="text-neutral-700">
              What was wrong?
              <select value={issue} onChange={(e) => setIssue(e.target.value as typeof issue)} className="ml-2 min-h-[40px] rounded border px-2">
                <option value="translation">Translation / wording</option>
                <option value="wrong">Information is wrong</option>
                <option value="outdated">Out of date</option>
                <option value="unsafe">Unsafe or inappropriate</option>
                <option value="other">Other</option>
              </select>
            </label>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              maxLength={1000}
              placeholder="Optional: suggest better wording. Reviewers will read this; do not include personal details."
              className="min-h-[70px] rounded border p-2"
            />
            <div className="flex gap-2">
              <button type="submit" className="min-h-[40px] rounded bg-forest-500 px-3 text-white">
                Send
              </button>
              <button type="button" onClick={() => setFb(null)} className="min-h-[40px] rounded border px-3">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => sendFeedback('helpful')} className="min-h-[40px] rounded border px-3 hover:bg-forest-50">
              👍 {t(language, 'feedback.helpful')}
            </button>
            <button type="button" onClick={() => setFb('form')} className="min-h-[40px] rounded border px-3 hover:bg-orange-50">
              👎 {t(language, 'feedback.notHelpful')}
            </button>
            <button type="button" onClick={() => setFb('form')} className="min-h-[40px] rounded border px-3 text-neutral-700 hover:bg-neutral-50">
              {t(language, 'feedback.translation')}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}

function guessDomain(entryId: string): 'public-service' | 'education' | 'agriculture' | 'health' | 'other' {
  if (/malaria|cholera|immun|water/.test(entryId)) return 'health';
  if (/shs|bece|school|literacy/.test(entryId)) return 'education';
  if (/maize|cocoa|armyworm|planting|extension/.test(entryId)) return 'agriculture';
  if (/card|voter|nhis|birth|passport|emergency/.test(entryId)) return 'public-service';
  return 'other';
}
