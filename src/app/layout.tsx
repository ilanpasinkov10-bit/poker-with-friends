import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { themeBootstrapScript } from '@/lib/theme';
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
  // The browser chrome follows the painted theme, not a fixed colour.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0b10' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script below sets `data-theme` on this element before
    // React hydrates, so the attribute legitimately differs from the server's.
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        {/* Inline and synchronous: anything deferred paints the wrong theme
            first. This is the whole of the no-flash mechanism. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }} />
      </head>
      <body className="min-h-dvh bg-base text-ink antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
