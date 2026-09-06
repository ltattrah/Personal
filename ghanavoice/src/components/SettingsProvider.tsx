'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/client/storage';

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void; ready: boolean }>({ settings: DEFAULT_SETTINGS, update: () => {}, ready: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  const update = (p: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      saveSettings(next);
      return next;
    });
  };
  return <Ctx.Provider value={{ settings, update, ready }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
