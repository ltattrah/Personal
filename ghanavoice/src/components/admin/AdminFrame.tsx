'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

const TOKEN_KEY = 'gv.admin.token';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-admin-token': getAdminToken(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new Error(body.error ? `${body.error}${body.details ? ': ' + JSON.stringify(body.details) : ''}` : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function AdminFrame({ children, title }: { children: ReactNode; title: string }) {
  const path = usePathname();
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setToken(getAdminToken());
    setReady(true);
  }, []);
  const links = [
    ['/admin', 'Overview'],
    ['/admin/content', 'Content review'],
    ['/admin/glossary', 'Glossary'],
    ['/admin/queue', 'Queue'],
    ['/admin/evaluation', 'Evaluation'],
    ['/admin/analytics', 'Analytics'],
    ['/admin/api-keys', 'API keys'],
  ];
  if (!ready) return null;
  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div>
          <Link href="/" className="text-xs underline">
            ← Citizen app
          </Link>
          <h1 className="text-xl font-semibold text-forest-900">GhanaVoice administration · {title}</h1>
        </div>
        <label className="text-xs">
          Admin token
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              try {
                sessionStorage.setItem(TOKEN_KEY, e.target.value);
              } catch {
                /* ignore */
              }
            }}
            placeholder="ADMIN_TOKEN (demo) or Supabase JWT"
            className="ml-1 rounded border px-2 py-1"
          />
        </label>
      </header>
      <nav className="my-3 flex flex-wrap gap-2 text-sm">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={`rounded-full border px-3 py-1 ${path === href ? 'border-forest-500 bg-forest-50 font-semibold' : ''}`}>
            {label}
          </Link>
        ))}
      </nav>
      {!token && <p className="mb-3 rounded bg-gold-50 p-2 text-sm">Enter the admin token to load data, then reload the page. In demo mode this is the ADMIN_TOKEN environment variable (default: change-me).</p>}
      {children}
    </div>
  );
}
