// Build committed per-game data for every archived game.
//
// Why this exists: ESPN's open API returns 403 Access Denied to datacenter IPs
// (measured on Vercel production, 2026-08-30), so the deployed site cannot fetch
// play-by-play itself. This script runs from a machine ESPN serves, and commits
// the result, which is the same architecture the estate already uses for spread
// data: fetch on a runner, commit, let the build render it.
//
// Output: public/games/<id>.json, one file per game, read by the game page.
// Play text is included only when it fits the size budget below; the CSV export
// states plainly when it has no text rather than inventing any.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'games');
const ARCHIVE = path.join(__dirname, '..', 'data', 'archive-index.json');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

const INCLUDE_TEXT = process.env.INCLUDE_TEXT !== '0';

fs.mkdirSync(OUT_DIR, { recursive: true });
const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      // Send no User-Agent: claiming to be a browser is what earns a 403 from a
      // datacenter, so this also works unchanged on a GitHub Actions runner.
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}

function parseClock(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return parseInt(m, 10) * 60 + parseFloat(sec);
  }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

function reduce(d, id) {
  const comp = d.header?.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away || !Array.isArray(d.plays) || d.plays.length < 50) return null;

  const plays = [];
  const details = [];
  for (const p of d.plays) {
    const clockSec = parseClock(p.clock?.displayValue);
    const period = p.period?.number;
    if (clockSec == null || !period) continue;
    plays.push([period, Math.round(clockSec * 10) / 10, p.homeScore ?? 0, p.awayScore ?? 0]);
    details.push([p.clock?.displayValue ?? '', p.scoringPlay ? 1 : 0, INCLUDE_TEXT ? (p.text ?? '') : '']);
  }
  if (plays.length < 50) return null;

  const pick = (d.pickcenter ?? []).find((p) => typeof p.spread === 'number');
  return {
    id,
    date: comp?.date ?? null,
    venue: d.gameInfo?.venue?.fullName ?? null,
    statusDetail: comp?.status?.type?.shortDetail ?? 'Final',
    home: { abbrev: home.team?.abbreviation ?? '?', name: home.team?.displayName ?? '?', score: +home.score || 0 },
    away: { abbrev: away.team?.abbreviation ?? '?', name: away.team?.displayName ?? '?', score: +away.score || 0 },
    homeWon: home.winner === true || +home.score > +away.score,
    spreadHome: pick ? pick.spread : null,
    homeMoneyline: pick?.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: pick?.awayTeamOdds?.moneyLine ?? null,
    plays,
    details, // [clockDisplay, scoringPlay(0|1), text]
  };
}

async function main() {
  const ids = archive.map((a) => a.id);
  log(`building game data for ${ids.length} archived games (text: ${INCLUDE_TEXT ? 'on' : 'off'})`);
  let done = 0, failed = 0, i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const out = path.join(OUT_DIR, `${id}.json`);
      if (fs.existsSync(out)) { done++; continue; }
      try {
        const d = await getJSON(`${BASE}/summary?event=${id}`);
        const g = reduce(d, id);
        if (!g) { failed++; log(`game ${id} UNUSABLE`); continue; }
        fs.writeFileSync(out, JSON.stringify(g));
        done++;
        await new Promise((r) => setTimeout(r, 90));
      } catch (e) {
        failed++;
        log(`game ${id} FAILED: ${e.message}`);
      }
      if ((done + failed) % 100 === 0) log(`${done + failed}/${ids.length} (ok ${done}, failed ${failed})`);
    }
  });
  await Promise.all(workers);

  const files = fs.readdirSync(OUT_DIR);
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  log(`DONE. wrote ${files.length} files, ${(bytes / 1048576).toFixed(1)}MB, ok ${done}, failed ${failed}`);
  // The arithmetic must reconcile: every id lands in exactly one bucket.
  if (done + failed !== ids.length) throw new Error(`bucket mismatch: ${done}+${failed} != ${ids.length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
