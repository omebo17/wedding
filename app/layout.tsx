import type { Metadata, Viewport } from 'next';
import { UploadProvider } from '@/components/UploadProvider';
import UploadDock from '@/components/UploadDock';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oto da Mari — the dance floor',
  description: 'Wedding photo wall. Scan, upload, and see the night through everyone else’s eyes.',
};

export const viewport: Viewport = {
  themeColor: '#dd7b93',
  width: 'device-width',
  initialScale: 1,
};

/**
 * suppressHydrationWarning on <html> and <body>: browser extensions
 * (password managers, Grammarly, colour pickers) add attributes to those
 * two elements before React hydrates, and React reports the difference as
 * a hydration mismatch even though nothing in this app differs between
 * server and client. It suppresses the warning for attributes on these
 * elements only — it does not hide real mismatches inside the page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {/*
          The queue lives above the pages so an upload started on /upload
          keeps running while the guest browses /gallery.
        */}
        <UploadProvider>
          {children}
          <UploadDock />
        </UploadProvider>
      </body>
    </html>
  );
}
