import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexaHome',
  description: 'Your Home. Connected. Intelligent.',
};

export const viewport: Viewport = {
  themeColor: '#f7f8f8',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}