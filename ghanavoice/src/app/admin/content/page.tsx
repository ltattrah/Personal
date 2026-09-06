'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { KnowledgeEntry, ReviewStatus } from '@/lib/kb/types';
import { TRANSITIONS } from '@/lib/admin/auth';
import { LANGUAGES } from '@/lib/i18n/languages';

const STATUS_STYLE: Record<ReviewStatus, string> = {
  draft: 'bg-neutral-100',
  in_review: 'bg-gold-100 text-gold-700',
  approved: 'bg-forest-100 text-forest-900',
  published: 'bg-forest-500 text-white',
  retired: 'bg-neutral-300',
};

export default function ContentAdmin() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');

  const load = useCallback(() => {
    adminFetch<{ entries: KnowledgeEntry[]; roles: string[] }>('/api/admin/content')
      .then((d) => {
        setEntries(d.entries);
        setRoles(d.roles);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function transition(id: string, to: ReviewStatus) {
    const note = prompt(`Note for moving to ${to} (optional):`) ?? undefined;
    try {
      await adminFetch('/api/admin/content', { method: 'PATCH', body: JSON.stringify({ id, to, note }) });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function save() {
    try {
      const parsed = JSON.parse(draft);
      await adminFetch('/api/admin/content', { method: 'POST', body: JSON.stringify(parsed) });
      setEditing(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const visible = entries.filter((e) => filter === 'all' || e.status === filter);
  const counts = entries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {});

  return (
    <AdminFrame title="Content review">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Your roles: {roles.join(', ') || '—'}</span>
        <span className="mx-2">|</span>
        {(['all', 'draft', 'in_review', 'approved', 'published', 'retired'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 ${filter === s ? 'border-forest-500 bg-forest-50 font-semibold' : ''}`}>
            {s} {s === 'all' ? entries.length : counts[s] ?? 0}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded bg-forest-500 px-3 py-1 text-white"
          onClick={() => {
            setEditing('__new__');
            setDraft(JSON.stringify(newEntryTemplate(), null, 2));
          }}
        >
          New entry
        </button>
      </div>

      {editing && (
        <div className="mb-4 rounded-xl border bg-white p-3">
          <h2 className="font-semibold">{editing === '__new__' ? 'New entry' : `Edit ${editing}`}</h2>
          <p className="text-xs text-neutral-600">Saving resets the entry to draft. Schema: src/lib/kb/load-content.ts. Health entries require healthGeneralInfoOnly: true and every entry needs a source with verifiedOn.</p>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-2 h-96 w-full rounded border p-2 font-mono text-xs" spellCheck={false} />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} className="rounded bg-forest-500 px-3 py-1 text-white">
              Save as draft
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded border px-3 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Entry</th>
              <th>Domain</th>
              <th>Languages (native-reviewed ✓)</th>
              <th>Updated / review by</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const stale = new Date(e.reviewBy) < new Date();
              return (
                <tr key={e.id} className="border-b align-top">
                  <td className="py-2">
                    <p className="font-medium">{e.renderings.find((r) => r.language === 'en')?.title ?? e.id}</p>
                    <p className="text-xs text-neutral-500">{e.id}</p>
                    <p className="text-xs text-neutral-500">{e.sources.length} source(s) · verified {e.sources.map((s) => s.verifiedOn).sort().at(-1)}</p>
                  </td>
                  <td>
                    {e.domain}
                    {e.domain === 'health' && <span className="ml-1 rounded bg-gold-100 px-1 text-xs">{e.healthGeneralInfoOnly ? 'general-info' : 'MISSING FLAG'}</span>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {e.renderings.map((r) => (
                        <span key={r.language} className={`rounded px-1 text-xs ${r.nativeReviewed ? 'bg-forest-100' : 'bg-neutral-100'}`} title={`origin: ${r.origin}`}>
                          {LANGUAGES[r.language].nameEn}
                          {r.nativeReviewed ? ' ✓' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-xs">
                    {e.updatedOn}
                    <br />
                    <span className={stale ? 'text-clay-700' : ''}>{e.reviewBy}{stale ? ' (overdue)' : ''}</span>
                  </td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[e.status]}`}>{e.status}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(TRANSITIONS[e.status] ?? []).map((tr) => (
                        <button key={tr.to} type="button" onClick={() => transition(e.id, tr.to as ReviewStatus)} className="rounded border px-2 py-0.5 text-xs hover:bg-forest-50" title={`requires ${tr.role}`}>
                          → {tr.to}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 text-xs"
                        onClick={() => {
                          setEditing(e.id);
                          setDraft(JSON.stringify(e, null, 2));
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}

function newEntryTemplate(): KnowledgeEntry {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: 'new-entry-id',
    domain: 'public-service',
    topic: 'public-service/topic',
    updatedOn: today,
    reviewBy: today,
    status: 'draft',
    regions: [],
    sources: [{ title: '', publisher: '', url: 'https://', verifiedOn: today, rights: '' }],
    renderings: [{ language: 'en', title: '', summary: '', body: '', keywords: [], origin: 'editor', nativeReviewed: false }],
  };
}
