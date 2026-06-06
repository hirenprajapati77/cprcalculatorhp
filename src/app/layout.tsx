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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground terminal-grid`}
      >
        <ToastProvider>
          <Navbar />
          <main className="flex-grow flex flex-col w-full max-w-7xl mx-auto px-4 py-6">
            {children}
          </main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
