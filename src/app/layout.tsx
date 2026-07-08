import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
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
};

import Providers from '@/components/Providers';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground terminal-grid`}
        suppressHydrationWarning
      >
        <Providers>
          <ToastProvider>
            <Navbar />
            {process.env.EXECUTION_MODE === 'SHADOW' && (
              <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-amber-500 text-xs font-medium tracking-wide z-50 relative">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                SHADOW VALIDATION MODE — NO LIVE ORDERS WILL BE ROUTED
              </div>
            )}
            <main className="flex-grow flex flex-col w-full max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
              {children}
            </main>
            <Footer />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
