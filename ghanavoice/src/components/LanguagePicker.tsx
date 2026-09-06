'use client';
import { LANGUAGE_CODES, LANGUAGES, describeStatus, type LanguageCode } from '@/lib/i18n/languages';

export function LanguagePicker({ value, onChange, compact = false }: { value: LanguageCode; onChange: (l: LanguageCode) => void; compact?: boolean }) {
  const current = LANGUAGES[value];
  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor="language-picker">
        Language
      </label>
      <select
        id="language-picker"
        value={value}
        onChange={(e) => onChange(e.target.value as LanguageCode)}
        className="min-h-[44px] rounded-lg border border-forest-500/40 bg-white px-3 text-base text-forest-900 focus:outline-none focus:ring-2 focus:ring-forest-500"
      >
        {LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGES[code].autonym} · {LANGUAGES[code].nameEn}
          </option>
        ))}
      </select>
      {!compact && current.defaultStatus !== 'evaluated' && (
        <p className="text-xs text-clay-700" role="note">
          {describeStatus(current.defaultStatus)}.
        </p>
      )}
    </div>
  );
}
