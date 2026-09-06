import type { LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

/** Always-visible banner. Emergency numbers are shown as tap-to-call links. */
export function DisclaimerBanner({ language }: { language: LanguageCode }) {
  return (
    <aside role="note" aria-label="Important notice" className="border-b border-gold-500 bg-gold-50 px-3 py-2 text-sm text-neutral-800">
      <p>
        <strong className="text-clay-700">Important:</strong> {t(language, 'disclaimer.short')}{' '}
        <a href="tel:112" className="font-semibold underline">
          Call 112
        </a>
      </p>
    </aside>
  );
}

export function EmergencyBox() {
  const lines = [
    { n: '112', label: 'National emergency' },
    { n: '191', label: 'Police' },
    { n: '192', label: 'Fire service' },
    { n: '193', label: 'Ambulance' },
  ];
  return (
    <div className="rounded-lg border-2 border-clay-500 bg-orange-50 p-3" role="alert">
      <p className="mb-2 font-semibold text-clay-700">If someone is in danger, call now:</p>
      <div className="grid grid-cols-2 gap-2">
        {lines.map((l) => (
          <a key={l.n} href={`tel:${l.n}`} className="flex min-h-[48px] items-center justify-center rounded-lg bg-clay-500 px-3 text-lg font-bold text-white hover:bg-clay-700">
            {l.n} <span className="ml-2 text-xs font-normal">{l.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function HealthDisclaimer() {
  return (
    <p className="mt-2 rounded-md bg-gold-50 p-2 text-xs text-neutral-800" role="note">
      This is general health information only. It is not a diagnosis or treatment advice. See a nurse, pharmacist or doctor for personal health questions.
    </p>
  );
}
