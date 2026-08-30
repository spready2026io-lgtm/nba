// Server-side adapter for ESPN's open NBA API. This is the free data source the
// app launched on (decision 2026-08-30); if it proves fragile in production the
// BALLDONTLIE GOAT tier slots in behind these same functions.
// Never call ESPN from the client; these run in route handlers / server components.

import type { GameData, GameStatus, PlayDetail, ReducedPlay, ScoreboardGame } from './types';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ESPN 403s custom UA strings (measured 2026-08-30); a plain browser UA passes.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.espn.com/',
  Origin: 'https://www.espn.com',
};

async function getJSON(url: string, revalidateSec: number): Promise<Record<string, unknown> | null> {
  // Every failure states its reason: a silent null here is undiagnosable in production.
  try {
    const r = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSec } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`[espn] ${r.status} ${r.statusText} for ${url} :: ${body.slice(0, 200)}`);
      return null;
    }
    return (await r.json()) as Record<string, unknown>;
  } catch (e) {
    console.error(`[espn] fetch threw for ${url}:`, e);
    return null;
  }
}

function statusOf(t: unknown): { status: GameStatus; detail: string } {
  const type = (t ?? {}) as { state?: string; shortDetail?: string; description?: string };
  const state = type.state ?? 'post';
  const detail = type.shortDetail ?? type.description ?? '';
  if (state === 'pre') return { status: 'pre', detail };
  if (state === 'in') return { status: 'in', detail };
  return { status: 'final', detail: detail || 'Final' };
}

export function parseClock(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v);
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return parseInt(m, 10) * 60 + parseFloat(sec);
  }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Returns null when the feed could NOT be read, [] when it was read and held no
// games. A caller that cannot tell those apart reports a broken feed as a quiet
// off-season, which is the failure this estate keeps relearning.
export async function fetchScoreboard(dateYYYYMMDD?: string): Promise<ScoreboardGame[] | null> {
  const url = dateYYYYMMDD ? `${BASE}/scoreboard?dates=${dateYYYYMMDD}` : `${BASE}/scoreboard`;
  const d = (await getJSON(url, 30)) as any;
  if (!d) return null;
  if (!d.events) return [];
  const games: ScoreboardGame[] = [];
  for (const e of d.events) {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;
    const { status, detail } = statusOf(e.status?.type);
    games.push({
      id: String(e.id),
      date: comp?.date ?? '',
      status,
      statusDetail: detail,
      home: { abbrev: home.team?.abbreviation ?? '?', name: home.team?.displayName ?? '?', score: +home.score || 0 },
      away: { abbrev: away.team?.abbreviation ?? '?', name: away.team?.displayName ?? '?', score: +away.score || 0 },
    });
  }
  return games;
}

export async function fetchGame(id: string): Promise<GameData | null> {
  // Live games refresh fast; finished games are immutable so cache long.
  const probe = (await getJSON(`${BASE}/summary?event=${id}`, 15)) as any;
  if (!probe?.header) return null;
  const d = probe;
  const comp = d.header?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  if (!home || !away) return null;
  const { status, detail } = statusOf(comp?.status?.type ?? d.header?.competitions?.[0]?.status?.type);

  const plays: ReducedPlay[] = [];
  const playDetails: PlayDetail[] = [];
  for (const p of d.plays ?? []) {
    const clockSec = parseClock(p.clock?.displayValue);
    const period = p.period?.number;
    if (clockSec == null || !period) continue;
    plays.push([period, Math.round(clockSec * 10) / 10, p.homeScore ?? 0, p.awayScore ?? 0]);
    playDetails.push({
      period,
      clock: p.clock?.displayValue ?? '',
      text: p.text ?? '',
      homeScore: p.homeScore ?? 0,
      awayScore: p.awayScore ?? 0,
      scoringPlay: !!p.scoringPlay,
      team: p.team?.id ? String(p.team.id) : undefined,
    });
  }

  const pick = (d.pickcenter ?? []).find((p: any) => typeof p.spread === 'number');
  return {
    id,
    date: comp?.date ?? null,
    venue: d.gameInfo?.venue?.fullName ?? null,
    status,
    statusDetail: detail,
    home: { abbrev: home.team?.abbreviation ?? '?', name: home.team?.displayName ?? '?', score: +home.score || 0 },
    away: { abbrev: away.team?.abbreviation ?? '?', name: away.team?.displayName ?? '?', score: +away.score || 0 },
    homeWon: status === 'final' ? (home.winner === true || +home.score > +away.score) : null,
    spreadHome: pick ? pick.spread : null,
    homeMoneyline: pick?.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: pick?.awayTeamOdds?.moneyLine ?? null,
    plays,
    playDetails,
  };
}
