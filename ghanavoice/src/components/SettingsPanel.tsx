'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSettings } from './SettingsProvider';
import { LanguagePicker } from './LanguagePicker';
import { clearAllLocalData, loadConsent, saveConsent } from '@/lib/client/storage';
import { defaultConsent, hasConsent, RETENTION_CHOICES_DAYS, setConsent, type ConsentState } from '@/lib/privacy/consent';

const REGIONS = ['Greater Accra', 'Ashanti', 'Eastern', 'Volta', 'Oti', 'Central', 'Western', 'Western North', 'Bono', 'Bono East', 'Ahafo', 'Northern', 'Savannah', 'North East', 'Upper East', 'Upper West'];

export function SettingsPanel() {
  const { settings, update } = useSettings();
  const [consent, setConsentState] = useState<ConsentState>(defaultConsent());
  const [cleared, setCleared] = useState(false);
  useEffect(() => setConsentState(loadConsent()), []);

  function changeConsent(granted: boolean, days?: number) {
    let c = setConsent(consent, 'audioStorage', granted, days ?? consent.records.audioStorage?.retentionDays ?? 7);
    if (!granted) c = setConsent(c, 'audioResearchUse', false);
    saveConsent(c);
    setConsentState(c);
  }

  const audioOn = hasConsent(consent, 'audioStorage');
  const days = consent.records.audioStorage?.retentionDays ?? 7;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-forest-900">Settings</h1>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="font-semibold">Language and region</h2>
        <div className="mt-2">
          <LanguagePicker value={settings.language} onChange={(l) => update({ language: l })} />
        </div>
        <label className="mt-3 block text-sm">
          Region (optional, used only to show regional information and aggregate statistics)
          <select value={settings.region ?? ''} onChange={(e) => update({ region: e.target.value || undefined })} className="mt-1 block min-h-[44px] w-full rounded-lg border px-2">
            <option value="">Not set</option>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="font-semibold">Voice</h2>
        <label className="mt-2 flex items-center justify-between gap-2 text-sm">
          Read answers aloud after voice questions
          <input type="checkbox" checked={settings.autoPlay} onChange={(e) => update({ autoPlay: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span>
            Allow an English voice to read Twi, Ewe or Ga text
            <span className="block text-xs text-neutral-500">Phones do not have Ghanaian-language voices; an English voice will mispronounce words.</span>
          </span>
          <input type="checkbox" checked={settings.allowEnglishVoiceFallback} onChange={(e) => update({ allowEnglishVoiceFallback: e.target.checked })} className="h-5 w-5" />
        </label>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="font-semibold">Your voice recordings</h2>
        <p className="text-xs text-neutral-600">Recordings are stored only if you allow it, linked to no name or number, and deleted automatically.</p>
        <label className="mt-2 flex items-center justify-between gap-2 text-sm">
          Store my recordings to improve speech recognition
          <input type="checkbox" checked={audioOn} onChange={(e) => changeConsent(e.target.checked)} className="h-5 w-5" />
        </label>
        {audioOn && (
          <fieldset className="mt-2 text-sm">
            <legend>Delete after</legend>
            <div className="mt-1 flex gap-2">
              {RETENTION_CHOICES_DAYS.map((d) => (
                <button key={d} type="button" onClick={() => changeConsent(true, d)} className={`min-h-[40px] flex-1 rounded-lg border ${days === d ? 'border-forest-500 bg-forest-50 font-semibold' : ''}`}>
                  {d} {d === 1 ? 'day' : 'days'}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <p className="mt-2 text-xs text-neutral-500">Consent version {consent.records.audioStorage?.textVersion ?? 'not yet asked'}; decided {consent.records.audioStorage?.at ? new Date(consent.records.audioStorage.at).toLocaleDateString() : 'never'}.</p>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="font-semibold">Conversation history</h2>
        <label className="mt-2 flex items-center justify-between gap-2 text-sm">
          Keep history on this device
          <input type="checkbox" checked={settings.keepHistory} onChange={(e) => update({ keepHistory: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="mt-2 block text-sm">
          Delete history automatically after
          <select value={settings.historyDays} onChange={(e) => update({ historyDays: Number(e.target.value) })} className="mt-1 block min-h-[44px] w-full rounded-lg border px-2">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={0}>Only when I delete it</option>
          </select>
        </label>
        <button
          type="button"
          className="mt-3 min-h-[44px] w-full rounded-lg border border-clay-500 text-clay-700"
          onClick={async () => {
            if (confirm('Delete all GhanaVoice data on this device, including downloaded packs and history?')) {
              await clearAllLocalData();
              setCleared(true);
            }
          }}
        >
          Delete all my data on this device
        </button>
        {cleared && <p className="mt-1 text-sm text-forest-700">All local data deleted. Reload the app to start fresh.</p>}
      </section>

      <section className="rounded-xl bg-white p-3 text-sm shadow-sm">
        <h2 className="font-semibold">About</h2>
        <p className="mt-1 text-neutral-700">GhanaVoice answers only from a reviewed knowledge base and shows its sources. It gives general information, not medical, legal or financial advice. In an emergency call 112.</p>
        <p className="mt-1 text-neutral-700">Twi (Asante and Akuapem), Ewe and Ga support is experimental until native speakers have validated it.</p>
        <p className="mt-2 flex gap-3">
          <Link className="underline" href="/pricing">
            For institutions
          </Link>
          <Link className="underline" href="/admin">
            Administration
          </Link>
        </p>
      </section>
    </div>
  );
}
