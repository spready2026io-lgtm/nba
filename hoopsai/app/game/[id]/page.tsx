import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchGame } from '@/lib/espn';
import { readCommittedGame } from '@/lib/game-data';
import { currentUser } from '@/lib/auth';
import { getSources } from '@/lib/store';
import GameRoom from '@/components/GameRoom';
import type { UploadedSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d{5,12}$/.test(id)) return { title: 'Game Room | HoopsAi' };
  const game = readCommittedGame(id) ?? (await fetchGame(id));
  if (!game) return { title: 'Game Room | HoopsAi' };
  return {
    title: `${game.away.name} at ${game.home.name} | HoopsAi Game Room`,
    description: `Live win probability, momentum and volatility for ${game.away.name} at ${game.home.name}, from Shimi's model.`,
  };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{5,12}$/.test(id)) notFound();
  // Live feed first (a game in progress must not be served from a frozen copy),
  // then the committed archive, which is what production actually serves today.
  const game = (await fetchGame(id)) ?? readCommittedGame(id);
  if (!game || game.plays.length === 0) notFound();

  let adjustHome: number | null = null;
  let adjustSource: string | null = null;
  let overlay: UploadedSource['overlay'] = null;
  const user = await currentUser();
  if (user) {
    const sources = await getSources();
    const mine = sources.filter((s) => s.username === user.username && s.status === 'synced');
    for (let i = mine.length - 1; i >= 0; i--) {
      if (adjustHome == null && mine[i].adjustHome != null) {
        adjustHome = mine[i].adjustHome!;
        adjustSource = mine[i].name;
      }
      if (!overlay && mine[i].overlay) overlay = mine[i].overlay;
      if (adjustHome != null && overlay) break;
    }
  }

  return <GameRoom initial={{ game, adjustHome, adjustSource, overlay }} />;
}
