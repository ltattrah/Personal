'use client';
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/i18n/languages';
import { defaultConsent, type ConsentState } from '@/lib/privacy/consent';
import type { AskResult } from '@/lib/rag/answer';

/**
 * All user data lives on the device. Nothing here is synced to a server; the
 * server only ever sees the current question (and audio, transiently, unless
 * consent to store was given).
 */
const KEYS = {
  settings: 'gv.settings.v1',
  consent: 'gv.consent.v1',
  history: 'gv.history.v1',
  session: 'gv.session.v1',
} as const;

export interface Settings {
  language: LanguageCode;
  region?: string;
  /** Read answers aloud automatically after voice questions */
  autoPlay: boolean;
  /** Allow an English browser voice to read non-English text (will mispronounce) */
  allowEnglishVoiceFallback: boolean;
  /** Keep conversation history on this device */
  keepHistory: boolean;
  /** Days to keep history locally; 0 = until deleted */
  historyDays: number;
}

export const DEFAULT_SETTINGS: Settings = { language: DEFAULT_LANGUAGE, autoPlay: true, allowEnglishVoiceFallback: false, keepHistory: true, historyDays: 30 };

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // Arrays (history) are returned as-is; objects (settings, consent) are merged over defaults.
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (parsed && typeof parsed === 'object') return { ...fallback, ...parsed };
    return fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); the app still works */
  }
}

export function loadSettings(): Settings {
  const s = read(KEYS.settings, DEFAULT_SETTINGS);
  if (!isLanguageCode(s.language)) s.language = DEFAULT_LANGUAGE;
  return s;
}
export function saveSettings(s: Settings) {
  write(KEYS.settings, s);
}

export function loadConsent(): ConsentState {
  return read(KEYS.consent, defaultConsent());
}
export function saveConsent(c: ConsentState) {
  write(KEYS.consent, c);
}

export interface HistoryItem {
  id: string;
  at: string;
  language: LanguageCode;
  question: string;
  inputMode: 'text' | 'voice';
  result: AskResult;
  offline?: boolean;
}

export function loadHistory(): HistoryItem[] {
  const items = read<HistoryItem[]>(KEYS.history, []);
  const s = loadSettings();
  if (s.historyDays > 0) {
    const cutoff = Date.now() - s.historyDays * 86_400_000;
    const kept = items.filter((i) => new Date(i.at).getTime() >= cutoff);
    if (kept.length !== items.length) write(KEYS.history, kept);
    return kept;
  }
  return items;
}
export function appendHistory(item: HistoryItem) {
  if (!loadSettings().keepHistory) return;
  const items = loadHistory();
  items.unshift(item);
  write(KEYS.history, items.slice(0, 200));
}
export function deleteHistoryItem(id: string) {
  write(KEYS.history, loadHistory().filter((i) => i.id !== id));
}
export function clearHistory() {
  write(KEYS.history, []);
}

/** Anonymous session id, rotated every 24h on the client; the server hashes it again with a daily salt. */
export function getSessionId(): string {
  const s = read<{ id: string; at: number } | null>(KEYS.session, null);
  if (s && Date.now() - s.at < 86_400_000) return s.id;
  const id = crypto.randomUUID();
  write(KEYS.session, { id, at: Date.now() });
  return id;
}

export async function clearAllLocalData() {
  Object.values(KEYS).forEach((k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('gv-packs')).map((n) => caches.delete(n)));
  }
}
