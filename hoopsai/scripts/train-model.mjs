// HoopsAi model pipeline: fetch 2025-26 NBA play-by-play from ESPN's open API,
// train Shimi's win-probability model (logistic regression via IRLS), and emit:
//   lib/model/coefficients.json  (the model + honest holdout metrics)
//   data/archive-index.json      (archive game list with our model's wp sparklines)
// Raw fetches are cached in scripts/cache/ (gitignored). Re-runs skip cached games.
//
// Estate rule: no fabricated data. Every number in the outputs is derived from
// fetched play-by-play. Games missing a pregame spread get prior=0, not a guess.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, 'cache');
const LOG = path.join(__dirname, 'train-log.txt');
const OUT_MODEL = path.join(__dirname, '..', 'lib', 'model', 'coefficients.json');
const OUT_ARCHIVE = path.join(__dirname, '..', 'data', 'archive-index.json');

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(OUT_MODEL), { recursive: true });
fs.mkdirSync(path.dirname(OUT_ARCHIVE), { recursive: true });
fs.writeFileSync(LOG, `start ${new Date().toISOString()}\n`);

const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      // Send no User-Agent: ESPN blocks a claimed browser UA whose client is not
      // a browser, so pretending to be Chrome is what gets refused off-desktop.
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}

// --- date plan: regular season sampled every 3rd day, playoffs every day ---
function* dateRange(from, to, step = 1) {
  const d = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (d <= end) {
    yield d.toISOString().slice(0, 10).replace(/-/g, '');
    d.setUTCDate(d.getUTCDate() + step);
  }
}
const dates = [
  ...dateRange('2025-10-21', '2026-04-12', 3), // regular season sample
  ...dateRange('2026-04-14', '2026-06-14', 1), // play-in + playoffs, all days
];

function parseClock(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.includes(':')) { const [m, sec] = s.split(':'); return parseInt(m, 10) * 60 + parseFloat(sec); }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

// seconds remaining in the whole game (regulation 2880; in OT, seconds left in current OT)
function secRemaining(period, clockSec) {
  if (period <= 4) return (4 - period) * 720 + clockSec;
  return clockSec; // inside an overtime period
}

function reduceSummary(d, id) {
  const comp = d.header?.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away || !Array.isArray(d.plays) || d.plays.length < 100) return null;
  const wpById = new Map((d.winprobability || []).map((w) => [w.playId, w.homeWinPercentage]));
  const plays = [];
  const espnWp = [];
  for (const p of d.plays) {
    const clockSec = parseClock(p.clock?.displayValue);
    const period = p.period?.number;
    if (clockSec == null || !period) continue;
    plays.push([period, Math.round(clockSec * 10) / 10, p.homeScore ?? 0, p.awayScore ?? 0]);
    espnWp.push(wpById.has(p.id) ? Math.round(wpById.get(p.id) * 1000) / 1000 : null);
  }
  if (plays.length < 100) return null;
  const pick = (d.pickcenter || []).find((p) => typeof p.spread === 'number');
  return {
    id,
    date: comp?.date || null,
    venue: d.gameInfo?.venue?.fullName || null,
    home: { abbrev: home.team?.abbreviation, name: home.team?.displayName, score: +home.score },
    away: { abbrev: away.team?.abbreviation, name: away.team?.displayName, score: +away.score },
    homeWon: home.winner === true || (+home.score > +away.score),
    spreadHome: pick ? pick.spread : null, // negative = home favored (ESPN convention)
    plays,
    espnWp,
  };
}

async function collectGameIds() {
  const ids = [];
  let done = 0;
  for (const d of dates) {
    try {
      const sbCache = path.join(CACHE, `sb-${d}.json`);
      let sb;
      if (fs.existsSync(sbCache)) {
        sb = JSON.parse(fs.readFileSync(sbCache, 'utf8'));
      } else {
        sb = await getJSON(`${BASE}/scoreboard?dates=${d}`);
        fs.writeFileSync(sbCache, JSON.stringify({ events: (sb.events || []).map((e) => ({ id: e.id, status: { type: { completed: e.status?.type?.completed } } })) }));
      }
      for (const e of sb.events || []) {
        if (e.status?.type?.completed) ids.push(e.id);
      }
    } catch (e) { log(`scoreboard ${d} FAILED: ${e.message}`); }
    if (++done % 25 === 0) log(`scoreboards ${done}/${dates.length}, games so far ${ids.length}`);
    await new Promise((r) => setTimeout(r, 60));
  }
  return [...new Set(ids)];
}

async function fetchGames(ids) {
  const games = [];
  let i = 0, failed = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const cacheFile = path.join(CACHE, `${id}.json`);
      try {
        let g;
        if (fs.existsSync(cacheFile)) {
          g = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } else {
          const d = await getJSON(`${BASE}/summary?event=${id}`);
          g = reduceSummary(d, id);
          if (g) fs.writeFileSync(cacheFile, JSON.stringify(g));
          await new Promise((r) => setTimeout(r, 100));
        }
        if (g) games.push(g);
        else failed++;
      } catch (e) { failed++; log(`game ${id} FAILED: ${e.message}`); }
      if ((games.length + failed) % 50 === 0) log(`games ${games.length + failed}/${ids.length} (usable ${games.length}, unusable ${failed})`);
    }
  });
  await Promise.all(workers);
  return { games, failed };
}

// --- features ---
// x1: margin / sqrt(secRemaining + 8)  (score dominance grows as clock drains)
// x2: -spreadHome * (secRemaining / 2880)  (pregame prior, decays; positive = home stronger)
// x3: margin  (raw margin, mid-game calibration)
function featuresOf(margin, secRem, spreadHome) {
  const prior = spreadHome == null ? 0 : -spreadHome;
  return [margin / Math.sqrt(secRem + 8), prior * Math.min(1, secRem / 2880), margin];
}

function buildRows(games) {
  const rows = [];
  for (const g of games) {
    for (const [period, clockSec, hs, as] of g.plays) {
      const secRem = secRemaining(period, clockSec);
      rows.push({ x: featuresOf(hs - as, secRem, g.spreadHome), y: g.homeWon ? 1 : 0, gid: g.id });
    }
  }
  return rows;
}

// Ridge-regularized IRLS logistic regression on standardized features.
// The data is quasi-separable (late-game margin almost perfectly predicts the
// winner), so plain IRLS diverges to NaN; ridge + eta clamping keeps it finite.
// Returns coefficients on the RAW feature scale (de-standardized).
function fitLogistic(rows, lambda = 1e-4, iters = 60) {
  const k = rows[0].x.length;
  const mean = new Array(k).fill(0);
  const sd = new Array(k).fill(0);
  for (const r of rows) for (let j = 0; j < k; j++) mean[j] += r.x[j];
  for (let j = 0; j < k; j++) mean[j] /= rows.length;
  for (const r of rows) for (let j = 0; j < k; j++) sd[j] += (r.x[j] - mean[j]) ** 2;
  for (let j = 0; j < k; j++) sd[j] = Math.sqrt(sd[j] / rows.length) || 1;

  const X = rows.map((r) => [1, ...r.x.map((v, j) => (v - mean[j]) / sd[j])]);
  const y = rows.map((r) => r.y);
  const kk = k + 1;
  const ridge = lambda * rows.length;
  let beta = new Array(kk).fill(0);

  for (let it = 0; it < iters; it++) {
    const XtWX = Array.from({ length: kk }, () => new Array(kk).fill(0));
    const XtWz = new Array(kk).fill(0);
    for (let n = 0; n < X.length; n++) {
      const xn = X[n];
      let eta = 0;
      for (let j = 0; j < kk; j++) eta += beta[j] * xn[j];
      eta = Math.max(-30, Math.min(30, eta));
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(mu * (1 - mu), 1e-4);
      const z = eta + (y[n] - mu) / w;
      for (let a = 0; a < kk; a++) {
        XtWz[a] += w * xn[a] * z;
        for (let b = a; b < kk; b++) XtWX[a][b] += w * xn[a] * xn[b];
      }
    }
    for (let a = 0; a < kk; a++) for (let b = 0; b < a; b++) XtWX[a][b] = XtWX[b][a];
    for (let a = 1; a < kk; a++) XtWX[a][a] += ridge; // do not penalize the intercept
    const next = solve(XtWX, XtWz);
    if (next.some((v) => !Number.isFinite(v))) throw new Error(`IRLS produced non-finite beta at iter ${it}`);
    const delta = Math.max(...next.map((v, j) => Math.abs(v - beta[j])));
    beta = next;
    if (delta < 1e-9) break;
  }

  // de-standardize back to raw feature scale
  const raw = new Array(kk).fill(0);
  raw[0] = beta[0];
  for (let j = 0; j < k; j++) {
    raw[j + 1] = beta[j + 1] / sd[j];
    raw[0] -= (beta[j + 1] * mean[j]) / sd[j];
  }
  return raw;
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  // after Gauss-Jordan the row is zero except its diagonal (row[i]) and the augment (row[n])
  return M.map((row, i) => row[n] / row[i]);
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const predict = (beta, x) => sigmoid(beta[0] + x.reduce((s, v, i) => s + beta[i + 1] * v, 0));

function metricsOn(rows, beta) {
  let ll = 0, brier = 0, correct = 0;
  for (const r of rows) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(beta, r.x)));
    ll += r.y ? -Math.log(p) : -Math.log(1 - p);
    brier += (p - r.y) ** 2;
    if ((p >= 0.5 ? 1 : 0) === r.y) correct++;
  }
  return { logLoss: ll / rows.length, brier: brier / rows.length, accuracy: correct / rows.length, n: rows.length };
}

function espnBrier(games, holdoutIds) {
  let brier = 0, n = 0;
  for (const g of games) {
    if (!holdoutIds.has(g.id)) continue;
    const y = g.homeWon ? 1 : 0;
    for (const wp of g.espnWp) {
      if (wp == null) continue;
      brier += (wp - y) ** 2;
      n++;
    }
  }
  return n ? { brier: brier / n, n } : null;
}

function wpSeries(g, beta) {
  return g.plays.map(([period, clockSec, hs, as]) =>
    predict(beta, featuresOf(hs - as, secRemaining(period, clockSec), g.spreadHome)));
}

function downsample(arr, target = 48) {
  if (arr.length <= target) return arr.map((v) => Math.round(v * 1000) / 1000);
  const out = [];
  for (let i = 0; i < target; i++) out.push(Math.round(arr[Math.floor((i * (arr.length - 1)) / (target - 1))] * 1000) / 1000);
  return out;
}

async function main() {
  log('collecting game ids');
  const ids = await collectGameIds();
  log(`unique completed games found: ${ids.length}`);
  const { games, failed } = await fetchGames(ids);
  log(`usable games: ${games.length}, unusable/failed: ${failed}`);
  if (games.length < 50) throw new Error(`only ${games.length} usable games, refusing to train`);

  // split by game, deterministic (sorted ids, every 5th to holdout)
  const sorted = [...games].sort((a, b) => a.id.localeCompare(b.id));
  const holdoutIds = new Set(sorted.filter((_, i) => i % 5 === 0).map((g) => g.id));
  const rows = buildRows(games);
  const trainRows = rows.filter((r) => !holdoutIds.has(r.gid));
  const testRows = rows.filter((r) => holdoutIds.has(r.gid));
  log(`rows: train ${trainRows.length}, holdout ${testRows.length}; fitting`);

  const beta = fitLogistic(trainRows);
  const trainM = metricsOn(trainRows, beta);
  const testM = metricsOn(testRows, beta);
  const espnM = espnBrier(games, holdoutIds);
  log(`beta: ${beta.map((b) => b.toFixed(5)).join(', ')}`);
  log(`train logloss ${trainM.logLoss.toFixed(4)} brier ${trainM.brier.toFixed(4)}`);
  log(`holdout logloss ${testM.logLoss.toFixed(4)} brier ${testM.brier.toFixed(4)} (n=${testM.n})`);
  if (espnM) log(`ESPN benchmark on same holdout games: brier ${espnM.brier.toFixed(4)} (n=${espnM.n})`);

  // volatility scale: 95th percentile of sum|delta wp| across corpus
  const volRaw = games.map((g) => {
    const s = wpSeries(g, beta);
    let sum = 0;
    for (let i = 1; i < s.length; i++) sum += Math.abs(s[i] - s[i - 1]);
    return sum;
  });
  const volSorted = [...volRaw].sort((a, b) => a - b);
  const volP95 = volSorted[Math.floor(volSorted.length * 0.95)];

  fs.writeFileSync(OUT_MODEL, JSON.stringify({
    version: 1,
    trainedAt: new Date().toISOString(),
    source: 'ESPN open API, 2025-26 season (regular season sampled every 3rd day + full play-in/playoffs)',
    games: games.length,
    gamesHoldout: holdoutIds.size,
    rowsTrain: trainRows.length,
    rowsHoldout: testRows.length,
    features: [
      'intercept',
      'margin / sqrt(secRemaining + 8)',
      '-pregameHomeSpread * min(1, secRemaining/2880)',
      'margin',
    ],
    coefficients: beta,
    volatilityP95: volP95,
    metrics: { train: trainM, holdout: testM, espnHoldoutBenchmark: espnM },
  }, null, 2));
  log(`wrote ${OUT_MODEL}`);

  const archive = games
    .map((g) => {
      const s = wpSeries(g, beta);
      let sum = 0;
      for (let i = 1; i < s.length; i++) sum += Math.abs(s[i] - s[i - 1]);
      return {
        id: g.id,
        date: g.date,
        venue: g.venue,
        home: g.home,
        away: g.away,
        homeWon: g.homeWon,
        spreadHome: g.spreadHome,
        volatility: Math.min(100, Math.round((sum / volP95) * 100)),
        finalHomeWp: Math.round(s[s.length - 1] * 1000) / 1000,
        spark: downsample(s),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  fs.writeFileSync(OUT_ARCHIVE, JSON.stringify(archive));
  log(`wrote ${OUT_ARCHIVE} (${archive.length} games, ${(fs.statSync(OUT_ARCHIVE).size / 1024).toFixed(0)}KB)`);
  log('DONE');
}

main().catch((e) => { log(`FATAL ${e.stack}`); process.exit(1); });
