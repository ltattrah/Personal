'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

export function BottomNav({ language }: { language: LanguageCode }) {
  const path = usePathname();
  const items = [
    { href: '/', label: t(language, 'nav.ask'), icon: '💬' },
    { href: '/offline', label: t(language, 'nav.offline'), icon: '⬇️' },
    { href: '/history', label: t(language, 'nav.history'), icon: '🕘' },
    { href: '/settings', label: t(language, 'nav.settings'), icon: '⚙️' },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((it) => {
          const active = path === it.href;
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} aria-current={active ? 'page' : undefined} className={`flex min-h-[56px] flex-col items-center justify-center text-xs ${active ? 'font-semibold text-forest-700' : 'text-neutral-600'}`}>
                <span aria-hidden className="text-lg">
                  {it.icon}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
