'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { ApiKeyRecord } from '@/lib/billing/api-keys';
import { PLANS } from '@/lib/billing/plans';

type KeyRow = Omit<ApiKeyRecord, 'keyHash'> & { usageThisMonth: number };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ plaintext: string; prefix: string } | null>(null);
  const [form, setForm] = useState({ organisationId: '', plan: 'api' as 'api' | 'organisation-assistant', domainScope: '' });

  const load = useCallback(() => {
    adminFetch<{ keys: KeyRow[] }>('/api/admin/api-keys')
      .then((d) => {
        setKeys(d.keys);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await adminFetch<{ plaintext: string; prefix: string }>('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ organisationId: form.organisationId, plan: form.plan, domainScope: form.domainScope || undefined }),
      });
      setCreated(r);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <AdminFrame title="API keys">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      <div className="grid gap-4 text-sm md:grid-cols-3">
        <form onSubmit={create} className="rounded-xl border bg-white p-3">
          <h2 className="font-semibold">Issue a key</h2>
          <label className="mt-2 block">
            Organisation id
            <input required value={form.organisationId} onChange={(e) => setForm({ ...form, organisationId: e.target.value })} className="mt-1 block w-full rounded border p-1" placeholder="uuid in full mode; any label in demo" />
          </label>
          <label className="mt-2 block">
            Plan
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as typeof form.plan })} className="mt-1 block w-full rounded border p-1">
              <option value="api">API access ({PLANS.api.entitlements.monthlyQuestions.toLocaleString()}/month)</option>
              <option value="organisation-assistant">Organisation-specific assistant</option>
            </select>
          </label>
          <label className="mt-2 block">
            Domain scope (optional topic prefix, e.g. <code>agriculture/</code>)
            <input value={form.domainScope} onChange={(e) => setForm({ ...form, domainScope: e.target.value })} className="mt-1 block w-full rounded border p-1" />
          </label>
          <button type="submit" className="mt-3 rounded bg-forest-500 px-3 py-1 text-white">
            Create
          </button>
          {created && (
            <div className="mt-3 rounded bg-gold-50 p-2">
              <p className="font-semibold">Copy this key now. It is shown once and stored hashed.</p>
              <code className="block break-all">{created.plaintext}</code>
            </div>
          )}
        </form>
        <section className="rounded-xl border bg-white p-3 md:col-span-2">
          <h2 className="font-semibold">Keys</h2>
          <table className="mt-2 w-full">
            <thead>
              <tr className="border-b text-left text-xs">
                <th className="py-1">Prefix</th>
                <th>Organisation</th>
                <th>Plan</th>
                <th>Scope</th>
                <th>Used this month</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const quota = PLANS[k.plan].entitlements.monthlyQuestions;
                return (
                  <tr key={k.id} className="border-b">
                    <td className="py-1 font-mono text-xs">{k.prefix}…</td>
                    <td>{k.organisationId}</td>
                    <td>{k.plan}</td>
                    <td className="text-xs">{k.domainScope ?? '—'}</td>
                    <td>
                      {k.usageThisMonth} / {quota === 'unlimited' ? '∞' : quota.toLocaleString()}
                    </td>
                    <td>{k.revokedAt ? <span className="text-clay-700">revoked</span> : 'active'}</td>
                    <td>
                      {!k.revokedAt && (
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={async () => {
                            if (confirm('Revoke this key? Integrations using it will stop working.')) {
                              await adminFetch(`/api/admin/api-keys?id=${k.id}`, { method: 'DELETE' });
                              load();
                            }
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-neutral-600">
            Usage: <code>POST /api/v1/ask</code> with header <code>Authorization: Bearer &lt;key&gt;</code> and JSON <code>{'{ "question", "language" }'}</code>. Responses include citations, confidence, safety category and usage.
          </p>
        </section>
      </div>
    </AdminFrame>
  );
}
