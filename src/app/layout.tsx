import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Poker With Friends — ניהול ערב פוקר',
  description:
    'ניהול ערב הפוקר של החברים: כניסות, ז׳יטונים, ספירה סופית והתחשבנות — הכול במקום אחד.',
  applicationName: 'Poker With Friends',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Poker Night' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0b10',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh bg-base text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
