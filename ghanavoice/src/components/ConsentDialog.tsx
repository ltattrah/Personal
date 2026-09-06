'use client';
import { useState } from 'react';
import type { LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';
import { RETENTION_CHOICES_DAYS } from '@/lib/privacy/consent';

interface Props {
  language: LanguageCode;
  onDecide: (granted: boolean, retentionDays: number, researchUse: boolean) => void;
}

/**
 * Shown once before the first voice question. Declining still allows voice:
 * audio is then processed transiently and never written to storage.
 */
export function ConsentDialog({ language, onDecide }: Props) {
  const [retention, setRetention] = useState<number>(7);
  const [research, setResearch] = useState(false);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="consent-title" className="text-lg font-semibold text-forest-900">
          {t(language, 'consent.audioTitle')}
        </h2>
        <p className="mt-2 text-sm text-neutral-800">{t(language, 'consent.audioBody')}</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
          <li>Your recording is linked only to the language and a random id, never to your name or phone.</li>
          <li>You can change this choice or delete data any time in Settings.</li>
          <li>Whatever you choose, the transcript is used only to answer your question.</li>
        </ul>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Delete my recording after</legend>
          <div className="mt-1 flex gap-2">
            {RETENTION_CHOICES_DAYS.map((d) => (
              <label key={d} className={`flex min-h-[40px] flex-1 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm ${retention === d ? 'border-forest-500 bg-forest-50' : ''}`}>
                <input type="radio" name="retention" className="sr-only" checked={retention === d} onChange={() => setRetention(d)} />
                {d} {d === 1 ? 'day' : 'days'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} className="mt-1" />
          <span>Also allow use in a dataset for improving Ghanaian-language speech recognition, after a native speaker checks the transcript. Recordings in that dataset keep the same deletion period unless you agree otherwise later.</span>
        </label>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => onDecide(true, retention, research)} className="min-h-[48px] flex-1 rounded-lg bg-forest-500 px-4 font-semibold text-white hover:bg-forest-700">
            {t(language, 'consent.accept')}
          </button>
          <button type="button" onClick={() => onDecide(false, retention, false)} className="min-h-[48px] flex-1 rounded-lg border border-neutral-300 px-4 font-semibold text-neutral-800 hover:bg-neutral-50">
            {t(language, 'consent.decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
