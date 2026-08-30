// Dashboard by game: live slate when the league is playing, the latest recorded
// games in the off-season. Every card opens that game's Game Room.

import Link from 'next/link';
import Sparkline from '@/components/Sparkline';
import { fetchScoreboard } from '@/lib/espn';
import { modelMeta } from '@/lib/model/shimi';
import archiveIndex from '@/data/archive-index.json';
import type { ArchiveEntry } from '@/lib/types';

export const revalidate = 60;

export default async function Home() {
  const archive = archiveIndex as ArchiveEntry[];
  const board = await fetchScoreboard();
  const feedAvailable = board !== null;
  // ESPN's dateless scoreboard returns the next scheduled slate in the off-season;
  // upcoming games have no plays yet, so they get schedule cards, not game rooms.
  const playable = (board ?? []).filter((g) => g.status !== 'pre');
  const upcoming = (board ?? []).filter((g) => g.status === 'pre');
  const featured = archive.slice(0, 12);

  return (
    <div className="px-4 md:px-8 pt-10 max-w-[1400px] mx-auto">
      <div className="label mb-2 flex items-center gap-2">
        <span className="dot dot-green" /> Live analytics / Dashboard
      </div>
      <h1 className="headline text-4xl md:text-5xl">
        Every possession moves the odds<span className="text-green">.</span>
      </h1>
      <p className="text-muted mt-3 max-w-xl text-[13.5px] leading-relaxed">
        HoopsAi puts an AI model on the game beside you: live win probability, momentum and volatility, read from real
        NBA play by play. Trained on {modelMeta.rowsTrain.toLocaleString()} play states from {modelMeta.gamesTrain} games,
        validated on {modelMeta.gamesHoldout} more it never saw.
      </p>

      {/* model proof strip */}
      <div className="flex flex-wrap gap-6 mt-6 panel px-5 py-4">
        <div>
          <div className="label-faint">Games modeled</div>
          <div className="font-bold text-lg">
            {modelMeta.games} <span className="text-faint text-[11px]">({modelMeta.gamesTrain} train / {modelMeta.gamesHoldout} holdout)</span>
          </div>
        </div>
        <div>
          <div className="label-faint">Holdout accuracy</div>
          <div className="font-bold text-lg text-green">{(modelMeta.holdout.accuracy * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="label-faint">Brier score</div>
          <div className="font-bold text-lg">{modelMeta.holdout.brier.toFixed(3)}</div>
        </div>
        {modelMeta.espnBenchmark && (
          <div>
            <div className="label-faint">ESPN benchmark (same games)</div>
            <div className="font-bold text-lg text-muted">{modelMeta.espnBenchmark.brier.toFixed(3)}</div>
          </div>
        )}
        <div className="ml-auto self-center">
          <Link href="/archive" className="btn">Browse the archive →</Link>
        </div>
      </div>

      {playable.length > 0 && (
        <>
          <div className="label mt-10 mb-3">Today&apos;s games</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playable.map((g) => (
              <Link key={g.id} href={`/game/${g.id}`} className="panel p-4 hover:border-[var(--border-strong)] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="label-faint">{g.statusDetail}</span>
                  {g.status === 'in' && <span className="dot dot-red dot-live" />}
                </div>
                <div className="mt-2 space-y-1">
                  <Row abbrev={g.away.abbrev} name={g.away.name} score={g.away.score} />
                  <Row abbrev={g.home.abbrev} name={g.home.name} score={g.home.score} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="label mt-10 mb-3">Next on the schedule</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((g) => (
              <div key={g.id} className="panel p-4 opacity-80">
                <div className="label-faint">{g.statusDetail}</div>
                <div className="mt-2 space-y-1">
                  <Row abbrev={g.away.abbrev} name={g.away.name} score={g.away.score} pre />
                  <Row abbrev={g.home.abbrev} name={g.home.name} score={g.home.score} pre />
                </div>
                <div className="label-faint mt-2">Game room opens at tip-off</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="label mt-10 mb-3">
        {playable.length > 0
          ? 'From the archive'
          : feedAvailable
            ? 'No games right now · latest recorded games'
            : 'Latest recorded games'}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((a) => (
            <Link key={a.id} href={`/game/${a.id}`} className="panel p-4 hover:border-[var(--border-strong)] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="label-faint">{a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                <span className={`text-[10px] font-bold ${a.volatility >= 70 ? 'text-green' : 'text-faint'}`}>VOL {a.volatility}/100</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <Row abbrev={a.away.abbrev} name={a.away.name} score={a.away.score} winner={!a.homeWon} />
                  <Row abbrev={a.home.abbrev} name={a.home.name} score={a.home.score} winner={a.homeWon} />
                </div>
                <Sparkline data={a.spark} width={92} height={34} baseline={0.5} />
              </div>
              <div className="label-faint mt-2 truncate">{a.venue}</div>
            </Link>
          ))}
      </div>
    </div>
  );
}

function Row({ abbrev, name, score, winner, pre }: { abbrev: string; name: string; score: number; winner?: boolean; pre?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[12.5px]">
        <span className="font-bold">{abbrev}</span> <span className="text-muted">{name}</span>
      </span>
      {!pre && <span className={`font-bold ${winner === false ? 'text-muted' : ''}`}>{score}</span>}
    </div>
  );
}
