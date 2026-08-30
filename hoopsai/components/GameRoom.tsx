'use client';

// The Game Room: win probability chart center stage, data sources on the left,
// export actions on the right, Shimi below. Finished games replay play-by-play
// through the real model; live games poll the feed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WinProbChart from './WinProbChart';
import DataSourcesRail from './DataSourcesRail';
import ShimiChat from './ShimiChat';
import AudioAnalyst from './AudioAnalyst';
import BetSlipModal from './BetSlipModal';
import {
  detectInsights,
  generateSlip,
  modelMeta,
  momentumShift,
  periodName,
  volatilityIndex,
  volatilityLabel,
  wpSeries,
} from '@/lib/model/shimi';
import type { GameData, UploadedSource } from '@/lib/types';

type Payload = {
  game: GameData;
  adjustHome: number | null;
  adjustSource: string | null;
  overlay: UploadedSource['overlay'];
};

const SPEED_MS: Record<number, number> = { 1: 280, 2: 140, 4: 60 };

export default function GameRoom({ initial }: { initial: Payload }) {
  const [payload, setPayload] = useState<Payload>(initial);
  const [cursor, setCursor] = useState(Math.max(0, initial.game.plays.length - 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [slipOpen, setSlipOpen] = useState(false);
  const [heatOpen, setHeatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());
  const [ago, setAgo] = useState(0);
  const liveFollow = useRef(true);

  const { game } = payload;
  const isLive = game.status === 'in';

  // one dashboard view per mount
  useEffect(() => {
    fetch('/api/track', { method: 'POST', body: JSON.stringify({ kind: 'dashboard' }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  }, []);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/game?id=${game.id}`);
      if (!r.ok) return;
      const d: Payload = await r.json();
      // never replace good state with a degraded payload (fewer plays than we have)
      setPayload((prev) => (d.game.plays.length >= prev.game.plays.length ? d : { ...d, game: prev.game }));
      setRefreshedAt(Date.now());
      if (isLive && liveFollow.current) setCursor((c) => Math.max(c, d.game.plays.length - 1));
    } catch {
      // transient poll failure: keep the last good state
    }
  }, [game.id, isLive]);

  // live polling
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(refetch, 15_000);
    return () => clearInterval(t);
  }, [isLive, refetch]);

  useEffect(() => {
    const t = setInterval(() => setAgo(Math.round((Date.now() - refreshedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [refreshedAt]);

  // replay engine
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCursor((c) => {
        if (c >= game.plays.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, SPEED_MS[speed]);
    return () => clearInterval(t);
  }, [playing, speed, game.plays.length]);

  const series = useMemo(
    () => wpSeries(game.plays, game.spreadHome, payload.adjustHome ?? 0),
    [game.plays, game.spreadHome, payload.adjustHome]
  );
  const insights = useMemo(() => detectInsights(game, series), [game, series]);

  const atEnd = cursor >= game.plays.length - 1;
  const sliced = useMemo(() => series.slice(0, cursor + 1), [series, cursor]);
  const cursorPlay = game.plays[cursor] ?? [1, 720, 0, 0];
  const cursorDetail = game.playDetails[cursor];
  const [curPeriod, , curHome, curAway] = cursorPlay;

  // a view of the game frozen at the cursor, for slip/commentary during replay
  const cursorGame: GameData = useMemo(
    () => ({
      ...game,
      status: atEnd ? game.status : 'in',
      statusDetail: atEnd ? game.statusDetail : `${periodName(curPeriod)} ${cursorDetail?.clock ?? ''}`,
      home: { ...game.home, score: curHome },
      away: { ...game.away, score: curAway },
    }),
    [game, atEnd, curPeriod, curHome, curAway, cursorDetail]
  );

  const wp = sliced[sliced.length - 1] ?? 0.5;
  const vol = volatilityIndex(sliced);
  const mom = momentumShift(sliced);
  const momTeam = mom >= 0 ? game.home.abbrev : game.away.abbrev;
  const expTeam = wp >= 0.5 ? game.home : game.away;
  const expWp = wp >= 0.5 ? wp : 1 - wp;
  const visibleInsights = insights.filter((i) => i.atPlay <= cursor).slice(-3).reverse();
  const slip = useMemo(() => generateSlip(cursorGame, sliced), [cursorGame, sliced]);

  const downloadCsv = () => {
    const rows = [['period', 'clock', 'text', 'home_score', 'away_score', 'model_home_wp']];
    game.playDetails.forEach((p, i) => {
      rows.push([String(p.period), p.clock, `"${p.text.replace(/"/g, '""')}"`, String(p.homeScore), String(p.awayScore), series[i]?.toFixed(4) ?? '']);
    });
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hoopsai_pbp_${game.away.abbrev}_at_${game.home.abbrev}_${game.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions); nothing to do
    }
  };

  return (
    <div className="px-4 pt-4 max-w-[1800px] mx-auto">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 px-2">
        <div>
          <div className="label mb-1 flex items-center gap-2">
            <span className={`dot ${isLive ? 'dot-red dot-live' : 'dot-green'}`} />
            {isLive ? 'Live analytics' : 'Game intelligence'} / Game room
          </div>
          <h1 className="headline text-2xl md:text-3xl">
            {game.away.name} at {game.home.name}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right" title="How often the model's in-game favorite won, measured on held-out games it never trained on">
            <div className="label-faint">Model accuracy · holdout</div>
            <div className="text-green font-bold text-lg">{(modelMeta.holdout.accuracy * 100).toFixed(1)}%</div>
          </div>
          <div className="panel-inset px-3 py-2 flex items-center gap-3">
            {isLive ? (
              <span className="label flex items-center gap-2">
                <span className="dot dot-red dot-live" /> Live feed
              </span>
            ) : (
              <>
                <button
                  className="btn btn-ghost !px-2 !py-1"
                  onClick={() => {
                    if (atEnd && !playing) setCursor(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? '❚❚ Pause' : atEnd ? '▶ Replay' : '▶ Resume'}
                </button>
                <button
                  className="btn btn-ghost !px-2 !py-1"
                  onClick={() => setSpeed((s) => (s === 4 ? 1 : s * 2))}
                  aria-label={`replay speed ${speed}x, click to change`}
                >
                  {speed}x
                </button>
                <button
                  className="btn btn-ghost !px-2 !py-1"
                  onClick={() => {
                    setPlaying(false);
                    setCursor(game.plays.length - 1);
                  }}
                >
                  End
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_290px]">
        {/* left: data sources; a new upload re-pulls the payload so the chart updates */}
        <DataSourcesRail adjustHome={payload.adjustHome} adjustSource={payload.adjustSource} onDataChanged={refetch} />

        {/* center */}
        <div className="min-w-0">
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <div className="font-bold tracking-[0.2em] text-[13px]">WIN PROBABILITY</div>
                <div className="label-faint mt-0.5">
                  {game.away.abbrev} @ {game.home.abbrev} · {curHome === 0 && curAway === 0 ? 'tip-off' : `${game.home.abbrev} ${curHome} - ${curAway} ${game.away.abbrev}`} ·{' '}
                  {atEnd && game.status === 'final' ? 'final' : `${periodName(curPeriod)} ${cursorDetail?.clock ?? ''}`}
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
                <span><span className="dot dot-green mr-1.5" />{game.home.abbrev} (home)</span>
                <span><span className="dot dot-red mr-1.5" />{game.away.abbrev}</span>
                {payload.overlay && <span className="text-blue">- - {payload.overlay.label}</span>}
              </div>
            </div>

            <WinProbChart game={game} series={series} cursor={cursor} overlay={payload.overlay} />

            {/* replay scrubber */}
            {!isLive && game.plays.length > 1 && (
              <input
                type="range"
                min={0}
                max={game.plays.length - 1}
                value={cursor}
                onChange={(e) => {
                  setPlaying(false);
                  setCursor(+e.target.value);
                }}
                className="w-full mt-1 accent-[var(--green)]"
                aria-label="replay position"
                aria-valuetext={`${periodName(curPeriod)} ${cursorDetail?.clock ?? ''}, play ${cursor + 1} of ${game.plays.length}`}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="label-faint">Volatility index</div>
                  <div className={`font-bold ${vol >= 70 ? 'text-green' : ''}`}>
                    {vol}/100 ({volatilityLabel(vol)})
                  </div>
                </div>
                <div>
                  <div className="label-faint">Momentum shift</div>
                  <div className={`font-bold ${mom >= 0 ? 'text-green' : 'text-red'}`}>
                    +{(Math.abs(mom) * 100).toFixed(1)}% {momTeam}
                  </div>
                </div>
                <div>
                  <div className="label-faint">{atEnd && game.status === 'final' ? 'Final win prob' : 'Expected win'}</div>
                  <div className="font-bold">
                    {expTeam.abbrev} {(expWp * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="label-faint">
                {isLive
                  ? `Data refreshed ${ago}s ago`
                  : atEnd
                    ? `Recorded game · ${game.plays.length} plays`
                    : `Replay · play ${cursor + 1}/${game.plays.length}`}
              </div>
            </div>
          </div>

          {/* Shimi */}
          <div className="panel mt-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded" style={{ background: 'var(--blue)' }}>🏀</span>
                <div>
                  <div className="font-bold tracking-[0.15em] text-[12px]">SHIMI · HOOPSAI ANALYST</div>
                  <div className="label-faint flex items-center gap-1.5">
                    <span className="dot dot-green" /> model v{modelMeta.version} · trained on {modelMeta.gamesTrain} games
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <ShimiChat game={cursorGame} wp={wp} vol={vol} mom={mom} spreadHome={game.spreadHome} adjustHome={payload.adjustHome} />

              {visibleInsights.length === 0 && (
                <div className="label-faint">No major swings detected {cursor < 20 ? 'yet' : 'in this stretch'}. Shimi flags moves of 15%+ win probability.</div>
              )}
              {visibleInsights.map((ins) => (
                <div key={`${ins.kind}-${ins.atPlay}`} className="flex gap-3">
                  <span className="flex items-center justify-center w-8 h-8 shrink-0 panel-inset text-green">⚡</span>
                  <div className="panel-inset px-3 py-2 flex-1">
                    <div className="label mb-1" style={{ color: 'var(--green)' }}>Insight detected</div>
                    <div className="text-[12.5px] leading-relaxed">{ins.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right: export actions */}
        <div className="space-y-4">
          <div className="panel p-4" style={{ borderColor: 'var(--green-dim)', background: 'rgba(77,255,102,0.05)' }}>
            <div className="label mb-2 flex items-center justify-between" style={{ color: 'var(--green)' }}>
              Prop predictor <span>↗</span>
            </div>
            <p className="text-[12px] text-muted mb-3">Generate a model-derived betting slip from the live win probability and volatility.</p>
            <button className="btn btn-green w-full" onClick={() => setSlipOpen(true)}>
              Generate slip →
            </button>
          </div>

          <AudioAnalyst game={cursorGame} series={sliced} />

          <div className="panel p-4">
            <div className="label mb-3">Quick reports</div>
            <div className="space-y-1">
              <button className="btn btn-ghost w-full !justify-between" onClick={downloadCsv}>
                Play-by-play CSV <span className="text-faint">↧</span>
              </button>
              <button className="btn btn-ghost w-full !justify-between" onClick={() => setHeatOpen(true)}>
                Momentum heatmap <span className="text-faint">▦</span>
              </button>
              <button className="btn btn-ghost w-full !justify-between" onClick={share}>
                {copied ? 'Link copied' : 'Share preview'} <span className="text-faint">⎘</span>
              </button>
              <button className="btn btn-ghost w-full !justify-between" onClick={() => window.print()}>
                Print summary <span className="text-faint">⎙</span>
              </button>
            </div>
          </div>

          <div className="panel p-4">
            <div className="label mb-2">Model card</div>
            <p className="text-[11px] text-muted leading-relaxed">
              Shimi v{modelMeta.version}, logistic regression on {modelMeta.rowsTrain.toLocaleString()} play states from{' '}
              {modelMeta.gamesTrain} games, validated on {modelMeta.gamesHoldout} held-out games. Holdout accuracy{' '}
              {(modelMeta.holdout.accuracy * 100).toFixed(1)}%, Brier {modelMeta.holdout.brier.toFixed(3)}
              {modelMeta.espnBenchmark ? ` (ESPN benchmark ${modelMeta.espnBenchmark.brier.toFixed(3)} on the same games)` : ''}.
            </p>
          </div>
        </div>
      </div>

      {slipOpen && <BetSlipModal legs={slip} game={cursorGame} onClose={() => setSlipOpen(false)} />}
      {heatOpen && <HeatmapModal series={series} game={game} onClose={() => setHeatOpen(false)} />}
    </div>
  );
}

function useModalBehavior(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return panelRef;
}

function HeatmapModal({ series, game, onClose }: { series: number[]; game: GameData; onClose: () => void }) {
  const panelRef = useModalBehavior(onClose);
  const SEGMENTS = 24;
  const cells = useMemo(() => {
    const out: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) {
      const a = Math.floor((s / SEGMENTS) * (series.length - 1));
      const b = Math.floor(((s + 1) / SEGMENTS) * (series.length - 1));
      out.push(series[b] - series[a]);
    }
    return out;
  }, [series]);
  const maxAbs = Math.max(0.02, ...cells.map(Math.abs));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-label="momentum heatmap" className="panel p-5 w-full max-w-lg outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="label">Momentum heatmap</div>
          <button className="text-muted hover:text-[var(--text)] cursor-pointer" onClick={onClose} aria-label="close">✕</button>
        </div>
        <p className="text-[11px] text-muted mb-3">
          Win-probability change per game segment. Green with + : toward {game.home.abbrev} (home). Red with - : toward {game.away.abbrev}.
        </p>
        <div className="grid grid-cols-12 gap-1">
          {cells.map((c, i) => (
            <div
              key={i}
              title={`segment ${i + 1}: ${(c * 100).toFixed(1)}% toward ${c >= 0 ? game.home.abbrev : game.away.abbrev}`}
              className="h-9 rounded-sm flex items-center justify-center text-[9px] font-bold"
              style={{
                background: c >= 0 ? `rgba(77,255,102,${0.12 + 0.8 * (c / maxAbs)})` : `rgba(255,54,72,${0.12 + 0.8 * (-c / maxAbs)})`,
                color: Math.abs(c) / maxAbs > 0.3 ? '#04170a' : 'var(--muted)',
              }}
            >
              {Math.abs(c) >= 0.02 ? (c >= 0 ? '+' : '-') : ''}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 label-faint">
          <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4{series.length > 0 && game.plays[game.plays.length - 1][0] > 4 ? ' +OT' : ''}</span>
        </div>
      </div>
    </div>
  );
}
