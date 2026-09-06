'use client';
import { useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { aggregate } from '@/lib/analytics/events';

type Payload = ReturnType<typeof aggregate> & { windowDays: number; storesConversationText: boolean };

export default function AnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminFetch<Payload>('/api/admin/analytics').then(setData).catch((e) => setError(e.message));
  }, []);
  return (
    <AdminFrame title="Analytics">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      {data && (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <section className="rounded-xl border bg-white p-3 md:col-span-2">
            <p>
              Last {data.windowDays} days · {data.total} events · {data.distinctSessions} distinct daily sessions. Conversation text stored: <strong>{data.storesConversationText ? 'yes' : 'no'}</strong>. Latency p50/p95: {data.latency.p50 ?? '—'} / {data.latency.p95 ?? '—'} ms.
            </p>
            <p className="text-xs text-neutral-600">Session identifiers are salted hashes that rotate daily; events cannot be linked to a person or across days. In demo mode events live in memory and reset on restart.</p>
          </section>
          <Table title="By language" rows={data.byLanguage} />
          <Table title="By outcome" rows={data.byKind} />
          <Table title="Safety rules triggered" rows={data.bySafety} />
          <Table title="By domain (escalations)" rows={data.byDomain} />
          <section className="rounded-xl border bg-white p-3">
            <h2 className="font-semibold">Feedback</h2>
            <ul className="mt-1">
              <li>Helpful: {data.feedback.helpful}</li>
              <li>Not helpful: {data.feedback.notHelpful}</li>
              <li>Translation problems reported: {data.feedback.translationIssues}</li>
            </ul>
          </section>
        </div>
      )}
    </AdminFrame>
  );
}

function Table({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <section className="rounded-xl border bg-white p-3">
      <h2 className="font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-neutral-500">No data</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-32 truncate">{k}</span>
              <span className="h-3 rounded bg-forest-500" style={{ width: `${(v / max) * 60}%` }} aria-hidden />
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
