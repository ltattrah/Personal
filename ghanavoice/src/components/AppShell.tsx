'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSettings } from './SettingsProvider';
import { DisclaimerBanner } from './Disclaimer';
import { BottomNav } from './Nav';
import { useOnline } from '@/hooks/useOnline';
import { t } from '@/lib/i18n/strings';

export function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const online = useOnline();
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col pb-16">
      <header className="flex items-center justify-between bg-forest-700 px-4 py-3 text-white">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {t(settings.language, 'app.name')}
        </Link>
        <span className="text-xs opacity-90">{t(settings.language, 'app.tagline')}</span>
      </header>
      <DisclaimerBanner language={settings.language} />
      {!online && (
        <div role="status" className="bg-neutral-800 px-3 py-1 text-center text-xs text-white">
          {t(settings.language, 'offline.banner')}
        </div>
      )}
      <main className="flex-1 px-3 py-4">{children}</main>
      <BottomNav language={settings.language} />
    </div>
  );
}
