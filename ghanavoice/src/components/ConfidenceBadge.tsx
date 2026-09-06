import type { ConfidenceBreakdown } from '@/lib/rag/confidence';
import type { LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

const STYLE = {
  high: 'bg-forest-100 text-forest-900 border-forest-500',
  medium: 'bg-gold-100 text-gold-700 border-gold-500',
  low: 'bg-orange-50 text-clay-700 border-clay-500',
};

export function ConfidenceBadge({ confidence, language }: { confidence: ConfidenceBreakdown; language: LanguageCode }) {
  const label = t(language, `confidence.${confidence.level}` as const);
  return (
    <details className="text-sm">
      <summary className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 ${STYLE[confidence.level]}`} aria-label={`${label}. Tap for details`}>
        <span aria-hidden>{confidence.level === 'high' ? '●●●' : confidence.level === 'medium' ? '●●○' : '●○○'}</span>
        {label}
      </summary>
      <div className="mt-2 rounded-lg bg-neutral-50 p-3 text-neutral-700">
        <p className="mb-1">This indicator reflects how well your question matched our curated information, not a guarantee of accuracy.</p>
        {confidence.notes.length > 0 && (
          <ul className="list-disc pl-5">
            {confidence.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
