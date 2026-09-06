import type { Citation } from '@/lib/rag/answer';
import type { LanguageCode } from '@/lib/i18n/languages';
import { LANGUAGES } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

export function Citations({ citations, language, heading }: { citations: Citation[]; language: LanguageCode; heading?: string }) {
  if (citations.length === 0) return null;
  return (
    <section className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm" aria-label={heading ?? t(language, 'answer.sources')}>
      <h3 className="mb-2 font-semibold text-forest-900">{heading ?? t(language, 'answer.sources')}</h3>
      <ol className="space-y-2">
        {citations.map((c) => (
          <li key={c.entryId} className="border-l-2 border-gold-500 pl-2">
            <p className="font-medium">{c.title}</p>
            <ul className="text-neutral-700">
              {c.sources.map((s, i) => (
                <li key={i}>
                  {s.url ? (
                    <a className="underline decoration-forest-500 underline-offset-2" href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.publisher}
                    </a>
                  ) : (
                    s.publisher
                  )}
                  : {s.title}
                  {s.verifiedOn && <span className="text-neutral-500"> · verified {s.verifiedOn}</span>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">
              {t(language, 'answer.updated')} {c.updatedOn} · {LANGUAGES[c.renderingLanguage].nameEn}
              {c.renderingLanguage !== 'en' && !c.nativeReviewed && <span className="text-clay-700"> · translation not yet native-reviewed</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
