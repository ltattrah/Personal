import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/components/SettingsProvider';

export const metadata: Metadata = {
  title: 'GhanaVoice',
  description: 'Public-service, education and agriculture information in Twi, Ewe, Ga and English.',
  manifest: '/manifest.webmanifest',
  applicationName: 'GhanaVoice',
  appleWebApp: { capable: true, title: 'GhanaVoice', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = { themeColor: '#1f5636', width: 'device-width', initialScale: 1, maximumScale: 5 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
