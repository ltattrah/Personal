import Link from 'next/link';
import { PLANS } from '@/lib/billing/plans';

export default function PricingPage() {
  const plans = Object.values(PLANS);
  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link href="/" className="text-sm underline">
        ← Back to GhanaVoice
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-forest-900">GhanaVoice for institutions</h1>
      <p className="mt-1 text-neutral-700">Citizen access stays free. Institutions fund the service through licences, organisation-specific assistants and API access.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <section key={p.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-sm text-neutral-600">{p.audience}</p>
            <p className="mt-2 text-xl font-bold text-forest-700">{p.indicativePriceGhs === null ? 'Free' : p.indicativePriceGhs === 'quote' ? 'Contact us' : `GHS ${p.indicativePriceGhs}/month`}</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Questions: {p.entitlements.monthlyQuestions === 'unlimited' ? 'unlimited' : p.entitlements.monthlyQuestions.toLocaleString()}/month</li>
              {p.entitlements.apiAccess && <li>REST API access with per-key quotas</li>}
              {p.entitlements.privateKnowledgeBase && <li>Private, organisation-only knowledge base</li>}
              {p.entitlements.customGlossary && <li>Custom glossary and terminology</li>}
              {p.entitlements.branding && <li>Your branding on the assistant</li>}
              {p.entitlements.analyticsExport && <li>Aggregate analytics export (no conversation text)</li>}
              {p.entitlements.slaSupport && <li>Support with service-level agreement</li>}
              {p.entitlements.offlinePacks && <li>Offline information packs</li>}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-neutral-500">All plans inherit the same safety layer, source citations and confidence indicator. Health content remains general information only on every plan; GhanaVoice is not offered for diagnosis or triage.</p>
    </main>
  );
}
