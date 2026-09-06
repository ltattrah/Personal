'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminFrame, adminFetch } from '@/components/admin/AdminFrame';
import type { AudioSampleRecord, EscalationRecord, FeedbackSuggestionRecord } from '@/lib/ops/store';
import { LANGUAGES } from '@/lib/i18n/languages';

type AudioWithUrl = AudioSampleRecord & { url: string | null };

export default function QueuePage() {
  const [esc, setEsc] = useState<EscalationRecord[]>([]);
  const [fb, setFb] = useState<FeedbackSuggestionRecord[]>([]);
  const [audio, setAudio] = useState<AudioWithUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    Promise.all([
      adminFetch<{ escalations: EscalationRecord[] }>('/api/admin/escalations'),
      adminFetch<{ suggestions: FeedbackSuggestionRecord[] }>('/api/admin/feedback'),
      adminFetch<{ samples: AudioWithUrl[] }>('/api/admin/audio').catch(() => ({ samples: [] })),
    ])
      .then(([e, f, a]) => {
        setEsc(e.escalations);
        setFb(f.suggestions);
        setAudio(a.samples);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function patch(path: string, body: unknown) {
    try {
      await adminFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <AdminFrame title="Queue">
      {error && <p className="text-sm text-clay-700">{error}</p>}
      <div className="flex flex-col gap-4 text-sm">
        <section className="rounded-xl border bg-white p-3">
          <h2 className="font-semibold">Escalations ({esc.filter((e) => e.status !== 'closed').length} open)</h2>
          <p className="text-xs text-neutral-600">Citizens who asked for a person. The question is shown because they requested it; closed tickets are purged after 30 days.</p>
          {esc.length === 0 ? (
            <p className="mt-2 text-neutral-500">No escalations.</p>
          ) : (
            <table className="mt-2 w-full">
              <thead>
                <tr className="border-b text-left text-xs">
                  <th className="py-1">Reference</th>
                  <th>Language</th>
                  <th>Domain</th>
                  <th>Question</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {esc.map((e) => (
                  <tr key={e.id} className="border-b align-top">
                    <td className="py-1 font-mono text-xs">{e.reference}</td>
                    <td>{LANGUAGES[e.language]?.nameEn ?? e.language}</td>
                    <td>{e.domain}</td>
                    <td className="max-w-md">{e.question}</td>
                    <td className="text-xs">{e.contactMethod === 'none' ? '—' : `${e.contactMethod}: ${e.contactValue ?? ''}`}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs ${e.status === 'open' ? 'bg-gold-100 text-gold-700' : e.status === 'closed' ? 'bg-neutral-200' : 'bg-forest-100'}`}>{e.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {e.status !== 'in_progress' && e.status !== 'closed' && (
                          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => patch('/api/admin/escalations', { id: e.id, status: 'in_progress' })}>
                            Take
                          </button>
                        )}
                        {e.status !== 'closed' && (
                          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => patch('/api/admin/escalations', { id: e.id, status: 'closed' })}>
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border bg-white p-3">
          <h2 className="font-semibold">Citizen suggestions ({fb.filter((f) => f.status === 'open').length} open)</h2>
          <p className="text-xs text-neutral-600">Wording corrections and reports. Accepting a suggestion records the decision; then edit the entry in Content review (it returns to draft).</p>
          {fb.length === 0 ? (
            <p className="mt-2 text-neutral-500">No suggestions.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {fb.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-xs text-neutral-500">
                      {new Date(f.createdAt).toLocaleString()} · {LANGUAGES[f.language]?.nameEn ?? f.language} · {f.issue} · {f.entryIds.join(', ') || 'no entry'}
                    </p>
                    <p className="whitespace-pre-line">{f.suggestedText}</p>
                    {f.handledBy && <p className="text-xs text-neutral-500">{f.status} by {f.handledBy}</p>}
                  </div>
                  {f.status === 'open' && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="rounded bg-forest-500 px-2 py-0.5 text-xs text-white" onClick={() => patch('/api/admin/feedback', { id: f.id, status: 'accepted' })}>
                        Accept
                      </button>
                      <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => patch('/api/admin/feedback', { id: f.id, status: 'rejected' })}>
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-white p-3">
          <h2 className="font-semibold">Audio awaiting native-speaker transcript ({audio.length})</h2>
          <p className="text-xs text-neutral-600">Only recordings the citizen consented to store. Each shows its deletion deadline. Transcribe in the standard orthography of the variety.</p>
          {audio.length === 0 ? (
            <p className="mt-2 text-neutral-500">Nothing to review{process.env.NODE_ENV !== 'production' ? ' (demo mode stores no audio)' : ''}.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {audio.map((a) => (
                <li key={a.id} className="grid gap-2 py-2 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-neutral-500">
                      {a.language ? LANGUAGES[a.language].nameEn : 'unknown language'} · {a.sttProvider ?? 'no STT'} {a.sttConfidence !== undefined ? `· conf ${(a.sttConfidence * 100).toFixed(0)}%` : ''} · deletes {new Date(a.expiresAt).toLocaleDateString()}
                    </p>
                    {a.url ? <audio controls src={a.url} className="mt-1 w-full" /> : <p className="text-xs text-clay-700">No playable URL</p>}
                    <p className="mt-1 text-xs">Machine transcript: {a.transcriptMachine ?? '—'}</p>
                  </div>
                  <form
                    className="flex flex-col gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void patch('/api/admin/audio', { id: a.id, transcript: transcripts[a.id] ?? '' });
                    }}
                  >
                    <textarea value={transcripts[a.id] ?? a.transcriptMachine ?? ''} onChange={(e) => setTranscripts({ ...transcripts, [a.id]: e.target.value })} className="min-h-[60px] rounded border p-1" lang={a.language ? LANGUAGES[a.language].providerTag : undefined} />
                    <button type="submit" className="self-start rounded bg-forest-500 px-3 py-1 text-white">
                      Save transcript
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminFrame>
  );
}
