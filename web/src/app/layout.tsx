import './globals.css';
import { Providers } from './providers';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';

export const metadata = {
  title: 'WC26 Predictor',
  description: 'FIFA World Cup 2026 — Fantasy Predictor League',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <Header />
          <main className="main">{children}</main>
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
