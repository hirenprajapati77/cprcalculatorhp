import { env } from '@/config/env';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import EnterpriseShell from '@/components/enterprise/EnterpriseShell';
import { ToastProvider } from '@/components/ui/Toast';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // B24 fix: themeColor must be in viewport (not metadata) in Next.js 14+
  // for PWA status bar coloring to work on iOS Safari.
  themeColor: '#06070b',
};

export const metadata: Metadata = {
  title: 'CPR PRO — Advanced Central Pivot Range Calculator & Trading Platform',
  description:
    'Calculate Central Pivot Range (CPR) instantly, analyze market bias (narrow, normal, wide), visualize resistance/support bands (R1-R4, S1-S4), export data reports, and compare session trading trends.',
  keywords: [
    'cpr calculator',
    'central pivot range',
    'pivot points',
    'trading calculator',
    'nse cpr scanner',
    'technical analysis',
    'intraday pivot range',
  ],
  authors: [{ name: 'CPR PRO Team' }],
  robots: 'index, follow',
  manifest: '/manifest.webmanifest',
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CPR PRO',
  },
  formatDetection: {
    telephone: false,
  },
};

import Providers from '@/components/Providers';
import PwaRegistration from '@/components/pwa/PwaRegistration';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('cpr_ui_theme');
                  var theme = stored || 'dark-pro';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light-pro' : 'dark-pro';
                  }
                  document.documentElement.setAttribute('data-theme', resolved);
                  if (resolved === 'light-pro') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.remove('light');
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground terminal-grid overflow-x-hidden`}
        suppressHydrationWarning
      >
        <Providers>
          <ToastProvider>
            <PwaRegistration />
            <EnterpriseShell shadowMode={env.EXECUTION_MODE === 'SHADOW'}>
              {children}
            </EnterpriseShell>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
