// Server-side adapter for ESPN's open NBA API. This is the free data source the
// app launched on (decision 2026-08-30); if it proves fragile in production the
// BALLDONTLIE GOAT tier slots in behind these same functions.
// Never call ESPN from the client; these run in route handlers / server components.

import type { GameData, GameStatus, PlayDetail, ReducedPlay, ScoreboardGame } from './types';


// Send NO User-Agent. Measured 2026-08-30 across three networks: ESPN's edge
// blocks a claimed browser UA whose client fingerprint is not a browser, which
// is why the "fix" of pretending to be Chrome is exactly what earns a 403 from a
// datacenter. Requests that do not claim to be a browser are served everywhere
// we tested, including Vercel and GitHub Actions runners.
//
// site.web.api is the same API on a second host, kept as a fallback because it
// served play-by-play from a runner even under the UA that site.api refused.
const HOSTS = [
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba',
  'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba',
];

async function getJSON(pathAndQuery: string, revalidateSec: number): Promise<Record<string, unknown> | null> {
  // Every failure states its reason and its host: a silent null here is
  // undiagnosable in production, which already cost one deploy to learn.
  for (let i = 0; i < HOSTS.length; i++) {
    const url = `${HOSTS[i]}${pathAndQuery}`;
    try {
      const r = await fetch(url, { next: { revalidate: revalidateSec } });
      if (r.ok) return (await r.json()) as Record<string, unknown>;
      const body = await r.text().catch(() => '');
      console.error(`[espn] ${r.status} ${r.statusText} for ${url} :: ${body.slice(0, 160)}`);
    } catch (e) {
      console.error(`[espn] fetch threw for ${url}:`, e);
    }
  }
  return null;
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
  const path = dateYYYYMMDD ? `/scoreboard?dates=${dateYYYYMMDD}` : '/scoreboard';
  const d = (await getJSON(path, 30)) as any;
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
  const probe = (await getJSON(`/summary?event=${id}`, 15)) as any;
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
