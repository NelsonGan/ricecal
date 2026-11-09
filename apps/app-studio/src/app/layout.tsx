import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RiceCal Studio',
  description: 'App Store and Play Store asset creator for RiceCal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
