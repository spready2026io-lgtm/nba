import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Ticker from '@/components/Ticker';
import NavBar from '@/components/NavBar';
import './globals.css';

const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'HoopsAi | Every Possession Moves the Odds',
  description:
    'Live NBA win probability from a model trained on a full season of play by play. Watch the odds move on every possession, and see how often the model is right.',
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
          <span className="label-faint">HoopsAi · the model watching every possession · data: ESPN public feeds · model: Shimi v1</span>
          <span className="label-faint">
            Probabilities are model output, not betting advice. Bet responsibly, 18+.
          </span>
        </footer>
      </body>
    </html>
  );
}
