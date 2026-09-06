'use client';
import { useEffect, useState } from 'react';
import { useSettings } from './SettingsProvider';
import { useOnline } from '@/hooks/useOnline';
import type { OfflinePack, OfflinePackManifest } from '@/lib/offline/packs';
import { domainTitle } from '@/lib/offline/packs';
import { downloadPack, listDownloadedPacks, removePack } from '@/lib/client/offline-search';
import { LANGUAGES } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

export function OfflinePacks() {
  const { settings } = useSettings();
  const lang = settings.language;
  const online = useOnline();
  const [available, setAvailable] = useState<OfflinePackManifest[]>([]);
  const [downloaded, setDownloaded] = useState<OfflinePack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void listDownloadedPacks().then(setDownloaded);
    if (online) {
      fetch('/api/packs')
        .then((r) => r.json())
        .then((d: { packs: OfflinePackManifest[] }) => setAvailable(d.packs))
        .catch(() => setError('Could not load the pack list.'));
    }
  }, [online]);

  const visible = available.filter((p) => showAll || p.language === lang);
  const have = new Set(downloaded.map((p) => p.id));
  const totalBytes = downloaded.reduce((a, p) => a + p.approxBytes, 0);

  async function get(m: OfflinePackManifest) {
    setBusy(m.id);
    setError(null);
    try {
      await downloadPack(m);
      setDownloaded(await listDownloadedPacks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-forest-900">{t(lang, 'offline.title')}</h1>
        <p className="text-sm text-neutral-700">Save approved information on your phone to read and search without data. Packs are small (tens of kilobytes) and show the date their content was last updated.</p>
      </header>

      {downloaded.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="font-semibold">{t(lang, 'offline.downloaded')}</h2>
          <p className="text-xs text-neutral-500">{downloaded.length} packs · about {(totalBytes / 1024).toFixed(0)} KB</p>
          <ul className="mt-2 divide-y">
            {downloaded.map((p) => {
              const newer = available.find((a) => a.id === p.id && a.contentUpdatedOn > p.contentUpdatedOn);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {domainTitle(p.domain)} · {LANGUAGES[p.language].autonym}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {p.entryCount} topics · content updated {p.contentUpdatedOn}
                      {newer && <span className="ml-1 text-clay-700">· update available</span>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {newer && (
                      <button type="button" onClick={() => get(newer)} className="min-h-[40px] rounded bg-forest-500 px-3 text-white">
                        Update
                      </button>
                    )}
                    <button type="button" onClick={() => removePack(p.id).then(() => listDownloadedPacks().then(setDownloaded))} className="min-h-[40px] rounded border px-3">
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Available</h2>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all languages
          </label>
        </div>
        {!online && <p className="text-sm text-neutral-600">Connect to the internet to see and download packs.</p>}
        {error && <p className="text-sm text-clay-700">{error}</p>}
        <ul className="mt-2 divide-y">
          {visible.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {domainTitle(m.domain)} · {LANGUAGES[m.language].autonym}
                </p>
                <p className="text-xs text-neutral-500">
                  {m.entryCount} topics · {(m.approxBytes / 1024).toFixed(0)} KB · updated {m.contentUpdatedOn}
                </p>
              </div>
              <button type="button" disabled={busy === m.id || have.has(m.id)} onClick={() => get(m)} className="min-h-[40px] rounded bg-forest-500 px-3 text-white disabled:opacity-50">
                {have.has(m.id) ? 'Saved' : busy === m.id ? '…' : t(lang, 'offline.download')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
