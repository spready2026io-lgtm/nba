// GET /api/game?id=... : reduced game data plus the signed-in user's model
// adjustments (uploaded via the Knowledge Hub). Model math itself is isomorphic
// (lib/model/shimi.ts), so clients compute series/insights at any replay cursor.

import { NextRequest, NextResponse } from 'next/server';
import { fetchGame } from '@/lib/espn';
import { readCommittedGame } from '@/lib/game-data';
import { currentUser } from '@/lib/auth';
import { getSources } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^\d{5,12}$/.test(id)) {
    return NextResponse.json({ error: 'bad game id' }, { status: 400 });
  }
  // live feed first for a game in progress, committed data otherwise; the
  // committed copy is also the fallback when the feed refuses us
  const game = (await fetchGame(id)) ?? readCommittedGame(id);
  if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 });

  let adjustHome: number | null = null;
  let overlay = null;
  let adjustSource: string | null = null;
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

  return NextResponse.json({ game, adjustHome, adjustSource, overlay });
}
