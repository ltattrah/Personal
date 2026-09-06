'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { GlossaryTerm } from '@/lib/kb/types';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';

const TARGETS: Exclude<LanguageCode, 'en'>[] = ['ak-asante', 'ak-akuapem', 'ee', 'gaa'];

export default function GlossaryAdmin() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);

  const load = useCallback(() => {
    adminFetch<{ terms: GlossaryTerm[] }>('/api/admin/glossary')
      .then((d) => {
        setTerms(d.terms);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save(term: GlossaryTerm) {
    try {
      await adminFetch('/api/admin/glossary', { method: 'POST', body: JSON.stringify(term) });
      setEditing(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const approvedCount = (l: Exclude<LanguageCode, 'en'>) => terms.filter((t) => t.renderings[l]?.approved).length;

  return (
    <AdminFrame title="Glossary">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      <p className="mb-2 text-sm text-neutral-700">
        Approved terms are passed to the answer generator as preferred terminology. Asante and Akuapem Twi are separate columns because spelling and vocabulary differ. Approval must be given by a native-speaker reviewer.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {TARGETS.map((l) => (
          <span key={l} className="rounded-full bg-neutral-100 px-3 py-1">
            {LANGUAGES[l].nameEn}: {approvedCount(l)}/{terms.length} approved
          </span>
        ))}
        <button
          type="button"
          className="ml-auto rounded bg-forest-500 px-3 py-1 text-white"
          onClick={() => setEditing({ id: `g-${Date.now()}`, concept: '', domain: 'general', en: '', renderings: {}, updatedOn: new Date().toISOString().slice(0, 10) })}
        >
          New term
        </button>
      </div>

      {editing && (
        <form
          className="mb-4 grid gap-2 rounded-xl border bg-white p-3 text-sm sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(editing);
          }}
        >
          <label>
            Concept key
            <input required value={editing.concept} onChange={(e) => setEditing({ ...editing, concept: e.target.value })} className="block w-full rounded border p-1" />
          </label>
          <label>
            English
            <input required value={editing.en} onChange={(e) => setEditing({ ...editing, en: e.target.value })} className="block w-full rounded border p-1" />
          </label>
          <label>
            Domain
            <select value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value as GlossaryTerm['domain'] })} className="block w-full rounded border p-1">
              {['general', 'public-service', 'education', 'agriculture', 'health'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {TARGETS.map((l) => {
            const r = editing.renderings[l] ?? { term: '', approved: false };
            return (
              <fieldset key={l} className="rounded border p-2">
                <legend className="px-1 text-xs font-semibold">{LANGUAGES[l].nameEn}</legend>
                <input placeholder="term" value={r.term} onChange={(e) => setEditing({ ...editing, renderings: { ...editing.renderings, [l]: { ...r, term: e.target.value } } })} className="block w-full rounded border p-1" />
                <input placeholder="note (usage, spelling)" value={r.note ?? ''} onChange={(e) => setEditing({ ...editing, renderings: { ...editing.renderings, [l]: { ...r, note: e.target.value } } })} className="mt-1 block w-full rounded border p-1" />
                <label className="mt-1 flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={r.approved} onChange={(e) => setEditing({ ...editing, renderings: { ...editing.renderings, [l]: { ...r, approved: e.target.checked } } })} /> Approved by native-speaker reviewer
                </label>
              </fieldset>
            );
          })}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded bg-forest-500 px-3 py-1 text-white">
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded border px-3 py-1">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">English</th>
              {TARGETS.map((l) => (
                <th key={l}>{LANGUAGES[l].autonym}</th>
              ))}
              <th>Domain</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.id} className="border-b align-top">
                <td className="py-2 font-medium">{t.en}</td>
                {TARGETS.map((l) => {
                  const r = t.renderings[l];
                  return (
                    <td key={l} className={r?.approved ? '' : 'text-neutral-500'}>
                      {r ? (
                        <>
                          {r.term} {r.approved ? <span title="approved">✓</span> : <span className="text-xs">(draft)</span>}
                          {r.note && <p className="text-xs text-neutral-500">{r.note}</p>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
                <td className="text-xs">{t.domain}</td>
                <td>
                  <button type="button" onClick={() => setEditing(t)} className="rounded border px-2 py-0.5 text-xs">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}
