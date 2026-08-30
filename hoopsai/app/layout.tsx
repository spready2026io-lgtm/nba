import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Ticker from '@/components/Ticker';
import NavBar from '@/components/NavBar';
import './globals.css';

const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'HoopsAi | NBA Win Probability, Live',
  description:
    'The data centre for NBA punters. Live win-probability charts built on real play-by-play, powered by Shimi, our sports data scientist.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jetbrains.variable} ${inter.variable}`}>
        <Ticker />
        <NavBar />
        <main>{children}</main>
        <footer
          className="mt-16 border-t px-6 py-4 flex flex-wrap gap-x-6 gap-y-1 items-center justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="label-faint">HoopsAi · hoopsai.com · data: ESPN public feeds · model: Shimi v1</span>
          <span className="label-faint">
            Probabilities are model output, not betting advice. Bet responsibly, 18+.
          </span>
        </footer>
      </body>
    </html>
  );
}
