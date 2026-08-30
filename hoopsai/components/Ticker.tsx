'use client';

// Top live-games ticker: score, status, and a spark of the win-probability chart
// per game (the design's top bar). Scrollable row, EST clock on the right.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Sparkline from './Sparkline';
import type { TickerGame } from '@/app/api/games/route';

export default function Ticker() {
  const [games, setGames] = useState<TickerGame[]>([]);
  const [offseason, setOffseason] = useState(false);
  const [clock, setClock] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/games');
      if (!r.ok) return;
      const d = await r.json();
      setGames(d.games ?? []);
      setOffseason(!!d.offseason);
    } catch {
      // keep the last good ticker on transient failures
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState in load() happens after an await
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    // derive EST/EDT from the formatter rather than asserting one of them
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
    const tick = () => setClock(fmt.format(new Date()).replace(/(.*) (\w+)$/, '$2 $1'));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const nudge = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="flex items-stretch border-b" style={{ borderColor: 'var(--border)', background: '#050706' }}>
      <Link href="/" className="flex items-center gap-2 px-4 shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
        <span
          className="flex items-center justify-center w-6 h-6 rounded font-bold text-[13px]"
          style={{ background: 'var(--blue)', color: '#fff' }}
        >
          H
        </span>
        <span className="font-bold tracking-[0.08em] text-[13px]">HOOPS AI</span>
      </Link>

      <div ref={scroller} className="flex-1 flex items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.length === 0 && (
          <div className="flex items-center px-4 label-faint">loading feed...</div>
        )}
        {games.map((g) => {
          const move = g.closingMove;
          return (
            <Link
              key={g.id}
              href={`/game/${g.id}`}
              className="flex items-center gap-3 px-4 py-2 border-r shrink-0 hover:bg-[var(--panel)] transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <div className="text-[11px] font-bold tracking-wider">
                  {g.away} <span className="text-faint">@</span> {g.home}
                </div>
                <div className="text-[12px] font-bold flex items-center gap-2">
                  <span>
                    {g.awayScore} - {g.homeScore}
                  </span>
                  <span className={`text-[9px] tracking-widest uppercase flex items-center gap-1 ${g.live ? 'text-red' : 'text-faint'}`}>
                    {g.live && <span className="dot dot-red dot-live" />}
                    {g.statusDetail}
                  </span>
                </div>
              </div>
              {g.spark.length > 1 && <Sparkline data={g.spark} width={76} height={22} baseline={0.5} />}
              {move != null && (
                <span className={`text-[10px] font-bold ${move >= 0 ? 'text-green' : 'text-red'}`}>
                  {move >= 0 ? '↗' : '↘'} {(Math.abs(move) * 100).toFixed(1)}%
                </span>
              )}
            </Link>
          );
        })}
        {offseason && games.length > 0 && (
          <div className="flex items-center px-4 shrink-0 label-faint">off-season · latest recorded games</div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 shrink-0 border-l" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[11px] text-muted whitespace-nowrap">{clock}</span>
        <button aria-label="scroll ticker left" onClick={() => nudge(-1)} className="text-muted hover:text-[var(--text)] cursor-pointer">
          ‹
        </button>
        <button aria-label="scroll ticker right" onClick={() => nudge(1)} className="text-muted hover:text-[var(--text)] cursor-pointer">
          ›
        </button>
      </div>
    </div>
  );
}
