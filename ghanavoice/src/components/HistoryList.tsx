'use client';
import { useEffect, useState } from 'react';
import { useSettings } from './SettingsProvider';
import { AnswerCard } from './AnswerCard';
import { clearHistory, deleteHistoryItem, loadHistory, type HistoryItem } from '@/lib/client/storage';
import { t } from '@/lib/i18n/strings';
import { LANGUAGES } from '@/lib/i18n/languages';

export function HistoryList() {
  const { settings } = useSettings();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setItems(loadHistory()), []);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-forest-900">{t(settings.language, 'history.title')}</h1>
        {items.length > 0 && (
          <button
            type="button"
            className="min-h-[40px] rounded border border-clay-500 px-3 text-sm text-clay-700"
            onClick={() => {
              if (confirm('Delete all conversation history from this device?')) {
                clearHistory();
                setItems([]);
              }
            }}
          >
            {t(settings.language, 'history.clear')}
          </button>
        )}
      </header>
      <p className="text-xs text-neutral-600">
        History is stored only on this device{settings.historyDays > 0 ? ` and deleted automatically after ${settings.historyDays} days` : ''}. GhanaVoice servers do not keep your questions.
      </p>
      {items.length === 0 && <p className="text-sm text-neutral-600">No conversations saved.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="flex-1 text-left" onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id}>
                <p className="font-medium">{it.question}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(it.at).toLocaleString()} · {LANGUAGES[it.language].nameEn} · {it.inputMode}
                  {it.offline && ' · offline'}
                </p>
              </button>
              <button
                type="button"
                aria-label="Delete this conversation"
                className="min-h-[40px] min-w-[40px] rounded border text-neutral-600"
                onClick={() => {
                  deleteHistoryItem(it.id);
                  setItems(loadHistory());
                }}
              >
                ✕
              </button>
            </div>
            {open === it.id && (
              <div className="mt-2">
                <AnswerCard result={it.result} language={it.language} question={it.question} offline={it.offline} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
