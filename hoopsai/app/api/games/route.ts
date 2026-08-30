// Ticker feed. Live scoreboard when games are on; outside game windows (and all
// off-season) it falls back to the most recent recorded games from the archive
// index, clearly labeled with their real dates. No invented games, ever.

import { NextResponse } from 'next/server';
import { fetchScoreboard } from '@/lib/espn';
import archiveIndex from '@/data/archive-index.json';
import type { ArchiveEntry } from '@/lib/types';

export const revalidate = 30;

export type TickerGame = {
  id: string;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  status: 'pre' | 'in' | 'final';
  statusDetail: string;
  date: string | null;
  spark: number[];
  // home team's win-probability move over the closing quarter of the series
  closingMove: number | null;
  live: boolean;
};

export async function GET() {
  const archive = archiveIndex as ArchiveEntry[];
  const sparkById = new Map(archive.map((a) => [a.id, a]));

  const board = await fetchScoreboard();
  // pre games have no play-by-play, so their game rooms 404; keep them out
  const active = board.filter((g) => g.status !== 'pre');

  let games: TickerGame[];
  if (active.length > 0) {
    games = active.slice(0, 12).map((g) => {
      const arch = sparkById.get(g.id);
      return {
        id: g.id,
        away: g.away.abbrev,
        home: g.home.abbrev,
        awayScore: g.away.score,
        homeScore: g.home.score,
        status: g.status,
        statusDetail: g.statusDetail,
        date: g.date,
        spark: arch?.spark ?? [],
        closingMove: arch ? closingMove(arch.spark) : null,
        live: g.status === 'in',
      };
    });
  } else {
    games = archive.slice(0, 12).map((a) => ({
      id: a.id,
      away: a.away.abbrev,
      home: a.home.abbrev,
      awayScore: a.away.score,
      homeScore: a.home.score,
      status: 'final' as const,
      statusDetail: 'Final',
      date: a.date,
      spark: a.spark,
      closingMove: closingMove(a.spark),
      live: false,
    }));
  }
  return NextResponse.json({ games, offseason: active.length === 0 });
}

function closingMove(spark: number[]): number | null {
  if (!spark || spark.length < 8) return null;
  const q = Math.floor(spark.length * 0.75);
  return spark[spark.length - 1] - spark[q];
}
