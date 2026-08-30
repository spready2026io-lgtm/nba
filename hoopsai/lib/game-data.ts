// Committed game data, written by scripts/build-game-data.mjs into public/games/.
// This is the production source for finished games: ESPN 403s datacenter IPs, so
// the deployed site cannot fetch play-by-play itself (measured 2026-08-30).
// Files under public/ are always present in the deployment filesystem.

import fs from 'node:fs';
import path from 'node:path';
import type { GameData, PlayDetail, ReducedPlay } from './types';

type CommittedGame = {
  id: string;
  date: string | null;
  venue: string | null;
  statusDetail: string;
  home: { abbrev: string; name: string; score: number };
  away: { abbrev: string; name: string; score: number };
  homeWon: boolean;
  spreadHome: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  plays: ReducedPlay[];
  details: [string, number, string][]; // [clockDisplay, scoringPlay, text]
};

const GAMES_DIR = path.join(process.cwd(), 'public', 'games');

export function readCommittedGame(id: string): GameData | null {
  if (!/^\d{5,12}$/.test(id)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(GAMES_DIR, `${id}.json`), 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') console.error(`[game-data] read ${id} failed:`, e);
    return null;
  }
  try {
    const g = JSON.parse(raw) as CommittedGame;
    const playDetails: PlayDetail[] = g.plays.map(([period, , hs, as], i) => {
      const d = g.details?.[i];
      return {
        period,
        clock: d?.[0] ?? '',
        text: d?.[2] ?? '',
        homeScore: hs,
        awayScore: as,
        scoringPlay: d?.[1] === 1,
      };
    });
    return {
      id: g.id,
      date: g.date,
      venue: g.venue,
      status: 'final',
      statusDetail: g.statusDetail || 'Final',
      home: g.home,
      away: g.away,
      homeWon: g.homeWon,
      spreadHome: g.spreadHome,
      homeMoneyline: g.homeMoneyline,
      awayMoneyline: g.awayMoneyline,
      plays: g.plays,
      playDetails,
    };
  } catch (e) {
    console.error(`[game-data] parse ${id} failed:`, e);
    return null;
  }
}
