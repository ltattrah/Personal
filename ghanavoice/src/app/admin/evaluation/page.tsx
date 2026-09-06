'use client';
import { useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { EvaluationRun } from '@/lib/evaluation/types';

interface LanguageRow {
  code: string;
  name: string;
  status: string;
  content: { renderings: number; nativeReviewed: number };
  ui: { translated: number; total: number };
  datasets: { stt: number; translation: number; safety: number; retrieval: number };
  latestStt: EvaluationRun | null;
  latestTranslation: EvaluationRun | null;
}

interface Payload {
  datasetVersion: string;
  computedNow: {
    safety: EvaluationRun & { failures: { id: string; expected: string; got: string }[] };
    retrieval: EvaluationRun & { byLanguage: Record<string, number>; failures: { id: string; language: string; got: string[] }[] };
  };
  recordedRuns: EvaluationRun[];
  languages: LanguageRow[];
  variation: { items: number; judged: number };
}

const pct = (n: number | undefined) => (n === undefined ? '—' : `${(n * 100).toFixed(0)}%`);

export default function EvaluationDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminFetch<Payload>('/api/admin/evaluation').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminFrame title="Evaluation">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      {!data && !error && <p className="text-sm">Loading…</p>}
      {data && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="rounded bg-gold-50 p-2">
            Numbers below are measured on the sample dataset <code>{data.datasetVersion}</code>. Transcription and translation quality show as <strong>not evaluated</strong> until runs with native-speaker references are recorded (docs/07). No figure here should be quoted as real-world accuracy.
          </p>

          <section className="rounded-xl border bg-white p-3">
            <h2 className="font-semibold">Per-language status</h2>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b text-left text-xs">
                    <th className="py-1">Language</th>
                    <th>Support status</th>
                    <th>Content renderings (native-reviewed)</th>
                    <th>UI strings</th>
                    <th>Eval items (stt / mt / safety / retrieval)</th>
                    <th>Transcription accuracy</th>
                    <th>Translation quality</th>
                  </tr>
                </thead>
                <tbody>
                  {data.languages.map((l) => (
                    <tr key={l.code} className="border-b">
                      <td className="py-1 font-medium">{l.name}</td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs ${l.status === 'evaluated' ? 'bg-forest-100' : 'bg-gold-100 text-gold-700'}`}>{l.status}</span>
                      </td>
                      <td>
                        {l.content.renderings} ({l.content.nativeReviewed})
                      </td>
                      <td>
                        {l.ui.translated}/{l.ui.total}
                      </td>
                      <td>
                        {l.datasets.stt} / {l.datasets.translation} / {l.datasets.safety} / {l.datasets.retrieval}
                      </td>
                      <td>{l.latestStt ? <RunCell run={l.latestStt} metric="wer" label="WER" invert /> : <span className="text-neutral-500">not evaluated</span>}</td>
                      <td>{l.latestTranslation ? <RunCell run={l.latestTranslation} metric="chrf" label="chrF" /> : <span className="text-neutral-500">not evaluated</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border bg-white p-3">
              <h2 className="font-semibold">Unsafe-answer guard (rule classifier)</h2>
              <p className="text-xs text-neutral-600">{data.computedNow.safety.itemCount} items · run just now</p>
              <dl className="mt-2 grid grid-cols-2 gap-1">
                <dt>Category accuracy</dt>
                <dd>{pct(data.computedNow.safety.metrics.categoryAccuracy)}</dd>
                <dt>Block decision accuracy</dt>
                <dd>{pct(data.computedNow.safety.metrics.blockAccuracy)}</dd>
                <dt>Under-block (missed unsafe)</dt>
                <dd className={data.computedNow.safety.metrics.underBlockRate > 0 ? 'text-clay-700' : ''}>{pct(data.computedNow.safety.metrics.underBlockRate)}</dd>
                <dt>Over-block (blocked safe)</dt>
                <dd>{pct(data.computedNow.safety.metrics.overBlockRate)}</dd>
              </dl>
              {data.computedNow.safety.failures.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Failures ({data.computedNow.safety.failures.length})</summary>
                  <ul className="list-disc pl-5 text-xs">
                    {data.computedNow.safety.failures.map((f) => (
                      <li key={f.id}>
                        {f.id}: expected {f.expected}, got {f.got}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <Caveats run={data.computedNow.safety} />
            </section>

            <section className="rounded-xl border bg-white p-3">
              <h2 className="font-semibold">Retrieval (hybrid lexical + embedding)</h2>
              <p className="text-xs text-neutral-600">{data.computedNow.retrieval.itemCount} items · run just now</p>
              <dl className="mt-2 grid grid-cols-2 gap-1">
                <dt>Hit@1</dt>
                <dd>{pct(data.computedNow.retrieval.metrics.hitAt1)}</dd>
                <dt>Hit@3</dt>
                <dd>{pct(data.computedNow.retrieval.metrics.hitAt3)}</dd>
                <dt>MRR</dt>
                <dd>{data.computedNow.retrieval.metrics.mrr.toFixed(2)}</dd>
              </dl>
              <h3 className="mt-2 text-xs font-semibold">Hit@1 by language (regional variation)</h3>
              <ul className="text-xs">
                {Object.entries(data.computedNow.retrieval.byLanguage).map(([l, v]) => (
                  <li key={l}>
                    {l}: {pct(v)}
                  </li>
                ))}
              </ul>
              {data.computedNow.retrieval.failures.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Misses ({data.computedNow.retrieval.failures.length})</summary>
                  <ul className="list-disc pl-5 text-xs">
                    {data.computedNow.retrieval.failures.map((f) => (
                      <li key={f.id}>
                        {f.id} ({f.language}): got {f.got.join(', ') || 'nothing'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <Caveats run={data.computedNow.retrieval} />
            </section>
          </div>

          <section className="rounded-xl border bg-white p-3">
            <h2 className="font-semibold">Asante / Akuapem variation set</h2>
            <p>
              {data.variation.items} paired items; {data.variation.judged} judged for mutual intelligibility by native speakers. Retrieval is tested with both spellings (see retrieval misses above for Akuapem-specific gaps).
            </p>
          </section>

          <section className="rounded-xl border bg-white p-3">
            <h2 className="font-semibold">Recorded runs (STT / translation from evaluation/scripts)</h2>
            {data.recordedRuns.length === 0 ? (
              <p className="text-neutral-600">
                No runs recorded yet. Run <code>python3 evaluation/scripts/compute_metrics.py</code> against native-speaker references and POST the result to <code>/api/admin/evaluation</code> (see evaluation/README.md).
              </p>
            ) : (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th>Task</th>
                    <th>Language</th>
                    <th>Provider</th>
                    <th>Items</th>
                    <th>Metrics</th>
                    <th>Native refs</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recordedRuns.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td>{r.task}</td>
                      <td>{r.language ?? '—'}</td>
                      <td>
                        {r.provider}
                        {r.model ? ` (${r.model})` : ''}
                      </td>
                      <td>{r.itemCount}</td>
                      <td>{Object.entries(r.metrics).map(([k, v]) => `${k}=${v}`).join(', ')}</td>
                      <td>{r.nativeReferences ? 'yes' : 'no'}</td>
                      <td>{new Date(r.ranAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </AdminFrame>
  );
}

function RunCell({ run, metric, label, invert }: { run: EvaluationRun; metric: string; label: string; invert?: boolean }) {
  const v = run.metrics[metric];
  return (
    <span title={run.caveats.join(' ')}>
      {label} {v === undefined ? '—' : invert ? `${(v * 100).toFixed(0)}%` : v.toFixed(2)} <span className="text-xs text-neutral-500">({run.provider}, n={run.itemCount}{run.nativeReferences ? '' : ', non-native refs'})</span>
    </span>
  );
}

function Caveats({ run }: { run: EvaluationRun }) {
  return (
    <ul className="mt-2 list-disc pl-5 text-xs text-neutral-600">
      {run.caveats.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  );
}
