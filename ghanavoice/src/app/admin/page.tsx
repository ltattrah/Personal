import Link from 'next/link';
import { AdminFrame } from '@/components/admin/AdminFrame';

export default function AdminHome() {
  const cards = [
    { href: '/admin/content', title: 'Content review and publishing', body: 'Draft → in review → approved → published. Separation of duties, source verification gate, health flag gate.' },
    { href: '/admin/glossary', title: 'Glossary and terminology', body: 'Approved terms per language variety, Asante/Akuapem distinctions, terms to avoid.' },
    { href: '/admin/queue', title: 'Queue: escalations, suggestions, audio', body: 'Citizens who asked for a person, wording corrections to triage, and consented recordings awaiting a native-speaker transcript.' },
    { href: '/admin/evaluation', title: 'Evaluation dashboard', body: 'Transcription accuracy, translation quality, unsafe-answer rate, regional variation, native-speaker review coverage.' },
    { href: '/admin/analytics', title: 'Usage analytics', body: 'Aggregate counts only: languages, outcomes, safety triggers, feedback. No conversation text is stored.' },
    { href: '/admin/api-keys', title: 'API keys and licences', body: 'Issue and revoke keys for API and organisation-assistant plans; monthly usage against quota.' },
  ];
  return (
    <AdminFrame title="Overview">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-xl border bg-white p-4 shadow-sm hover:border-forest-500">
            <h2 className="font-semibold text-forest-900">{c.title}</h2>
            <p className="mt-1 text-sm text-neutral-700">{c.body}</p>
          </Link>
        ))}
      </div>
      <section className="mt-6 rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Roles</h2>
        <ul className="mt-1 list-disc pl-5">
          <li><strong>editor</strong>: create and edit entries and glossary terms; submit for review.</li>
          <li><strong>reviewer</strong>: approve or send back; must be a different person from the submitter; native-speaker reviewers mark renderings as reviewed.</li>
          <li><strong>publisher</strong>: publish approved entries and retire published ones.</li>
          <li><strong>admin</strong>: all of the above plus API keys and organisation settings.</li>
        </ul>
      </section>
    </AdminFrame>
  );
}
