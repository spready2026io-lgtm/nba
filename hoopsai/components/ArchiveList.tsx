'use client';

// Archive rows with search and the mock's three filters. Click a row to load
// that game's full analysis in the Game Room (replay).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Sparkline from './Sparkline';
import type { ArchiveEntry } from '@/lib/types';

type Filter = 'all' | 'volatile' | 'close';
const PAGE = 40;

export default function ArchiveList({ archive }: { archive: ArchiveEntry[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return archive.filter((a) => {
      if (filter === 'volatile' && a.volatility < 70) return false;
      if (filter === 'close' && Math.abs(a.home.score - a.away.score) > 5) return false;
      if (!needle) return true;
      return [a.home.name, a.home.abbrev, a.away.name, a.away.abbrev, a.venue ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [archive, q, filter]);

  const shown = filtered.slice(0, limit);

  return (
    <div className="mt-8">
      <div className="flex flex-col md:flex-row gap-3">
        <input
          className="input md:flex-1"
          placeholder="Search teams, arenas, or matchups"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="search archive"
        />
        <div className="flex gap-2">
          {(
            [
              ['all', 'All games'],
              ['volatile', 'High volatility'],
              ['close', 'Close games'],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              className="btn"
              style={filter === f ? { borderColor: 'var(--green)', color: 'var(--green)' } : {}}
              onClick={() => {
                setFilter(f);
                setLimit(PAGE);
              }}
            >
              ⚙ {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <span className="label">{filtered.length} recorded games</span>
        <span className="label-faint">Click any row to load analysis</span>
      </div>

      <div className="space-y-2">
        {shown.map((a) => {
          const d = a.date ? new Date(a.date) : null;
          const up = a.spark.length > 1 && a.spark[a.spark.length - 1] >= a.spark[0];
          return (
            <Link
              key={a.id}
              href={`/game/${a.id}`}
              className="panel p-3 md:p-4 flex items-center gap-4 hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="panel-inset w-12 h-12 shrink-0 flex flex-col items-center justify-center">
                <span className="label-faint">{d ? d.toLocaleDateString('en-US', { month: 'short' }) : '?'}</span>
                <span className="font-bold">{d ? d.getDate() : ''}</span>
              </div>

              <div className="w-40 shrink-0 hidden md:block">
                <div className="label-faint">{d ? d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : ''}</div>
                <div className="text-[12px] text-muted truncate">{a.venue ?? ''}</div>
              </div>

              <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 items-center">
                <span className="label-faint">Away</span>
                <span className="font-bold text-[13px]">{a.away.abbrev}</span>
                <span className={`font-bold text-[15px] ${!a.homeWon ? '' : 'text-muted'}`}>{a.away.score}</span>
                <span className="label-faint">Home</span>
                <span className="font-bold text-[13px]">{a.home.abbrev}</span>
                <span className={`font-bold text-[15px] ${a.homeWon ? '' : 'text-muted'}`}>{a.home.score}</span>
              </div>

              <div className="hidden sm:block">
                <Sparkline data={a.spark} width={150} height={36} baseline={0.5} />
              </div>

              <div className={`hidden sm:flex items-center gap-1.5 w-16 label-faint ${up ? 'text-green' : 'text-red'}`}>
                <span className={`dot ${up ? 'dot-green' : 'dot-red'}`} /> {up ? 'UP' : 'DOWN'}
              </div>

              <div className="w-24 text-right shrink-0">
                <div className="label-faint">Volatility</div>
                <div className="font-bold">
                  <span className={a.volatility >= 70 ? 'text-green' : ''}>{a.volatility}</span>
                  <span className="text-faint"> / 100</span>
                  <span className={`ml-1 ${up ? 'text-green' : 'text-red'}`}>{up ? '↗' : '↘'}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {shown.length < filtered.length && (
        <button className="btn w-full mt-4" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - shown.length} remaining)
        </button>
      )}
      {filtered.length === 0 && <div className="label-faint text-center py-10">No games match that search.</div>}
    </div>
  );
}
