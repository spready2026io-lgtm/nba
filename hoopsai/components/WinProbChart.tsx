'use client';

// The Win Probability Chart, centerpiece of the Game Room. Mirrored area chart:
// home team's edge fills green above the 50/50 line, away team's fills red below,
// exactly as in Ofer's mock. X axis is real game time; quarter boundaries gridded.

import { useMemo, useRef, useState } from 'react';
import type { GameData } from '@/lib/types';

type Props = {
  game: GameData;
  series: number[]; // full home-wp series aligned to game.plays
  cursor: number; // plays[0..cursor] are visible (replay); series.length-1 = all
  overlay?: { label: string; points: [number, number][] } | null;
};

const W = 1000;
const H = 380;
const PAD_L = 46;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30;

export default function WinProbChart({ game, series, cursor, overlay }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // x position: fraction of total game time elapsed (handles OT by extending)
  const geometry = useMemo(() => {
    const maxPeriod = Math.max(4, ...game.plays.map((p) => p[0]));
    const totalSec = 4 * 720 + (maxPeriod - 4) * 300;
    const elapsed = (period: number, clockSec: number) => {
      const before = period <= 4 ? (period - 1) * 720 : 4 * 720 + (period - 5) * 300;
      const len = period <= 4 ? 720 : 300;
      return before + (len - clockSec);
    };
    const xs = game.plays.map(([p, c]) => elapsed(p, c) / totalSec);
    const bounds: { x: number; label: string }[] = [];
    for (let q = 1; q <= maxPeriod; q++) {
      bounds.push({
        x: (q <= 4 ? (q - 1) * 720 : 4 * 720 + (q - 5) * 300) / totalSec,
        label: q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`,
      });
    }
    return { xs, bounds };
  }, [game.plays]);

  const px = (f: number) => PAD_L + f * (W - PAD_L - PAD_R);
  const midY = PAD_T + (H - PAD_T - PAD_B) / 2;
  const halfH = (H - PAD_T - PAD_B) / 2;
  // wp 1.0 => top, wp 0.0 => bottom
  const py = (wp: number) => midY - (wp - 0.5) * 2 * halfH;

  const visible = Math.min(cursor + 1, series.length);

  const paths = useMemo(() => {
    if (visible < 2) return { green: '', red: '', line: '' };
    const pts: [number, number][] = [];
    for (let i = 0; i < visible; i++) pts.push([px(geometry.xs[i]), py(series[i])]);
    // clip each segment against the midline to build the two area fills
    let green = '';
    let red = '';
    const seg = (list: [number, number][]) => list.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const greenPts: [number, number][][] = [];
    const redPts: [number, number][][] = [];
    let cur: [number, number][] = [];
    let curSide: 'g' | 'r' | null = null;
    const flush = () => {
      if (cur.length > 1 && curSide) (curSide === 'g' ? greenPts : redPts).push(cur);
      cur = [];
    };
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const side: 'g' | 'r' = y <= midY ? 'g' : 'r';
      if (curSide === null) {
        curSide = side;
        cur.push([x, y]);
        continue;
      }
      if (side === curSide) {
        cur.push([x, y]);
      } else {
        const [xp, yp] = pts[i - 1];
        const t = (midY - yp) / (y - yp);
        const xi = xp + t * (x - xp);
        cur.push([xi, midY]);
        flush();
        curSide = side;
        cur = [[xi, midY], [x, y]];
      }
    }
    flush();
    for (const g of greenPts) {
      green += `${seg(g)}L${g[g.length - 1][0].toFixed(1)},${midY}L${g[0][0].toFixed(1)},${midY}Z`;
    }
    for (const r of redPts) {
      red += `${seg(r)}L${r[r.length - 1][0].toFixed(1)},${midY}L${r[0][0].toFixed(1)},${midY}Z`;
    }
    return { green, red, line: seg(pts) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, visible, geometry]);

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < visible; i++) {
      const d = Math.abs(px(geometry.xs[i]) - fx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const h = hover != null && hover < visible ? hover : null;
  const hd = h != null ? game.playDetails[h] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ display: 'block' }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Win probability chart, ${game.away.name} at ${game.home.name}`}
      >
        <defs>
          <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="rfill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--red)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--red)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* y grid: 100 / 50 / 0(mid) / 50 / 100 */}
        {[1, 0.75, 0.5, 0.25, 0].map((wp) => (
          <g key={wp}>
            <line x1={PAD_L} x2={W - PAD_R} y1={py(wp)} y2={py(wp)} stroke="var(--border)" strokeWidth={wp === 0.5 ? 0 : 1} strokeDasharray="3 5" />
            <text x={PAD_L - 8} y={py(wp) + 3.5} textAnchor="end" fontSize="12" fill="var(--faint)" fontFamily="var(--font-mono)">
              {Math.round(Math.abs(wp - 0.5) * 200)}%
            </text>
          </g>
        ))}

        {/* quarter boundaries */}
        {geometry.bounds.map((b) => (
          <g key={b.label}>
            <line x1={px(b.x)} x2={px(b.x)} y1={PAD_T} y2={H - PAD_B} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 6" />
            <text x={px(b.x) + 4} y={H - PAD_B + 16} fontSize="12" fill="var(--faint)" fontFamily="var(--font-mono)">
              {b.label}
            </text>
          </g>
        ))}

        {/* areas + midline + trace */}
        {paths.green && <path d={paths.green} fill="url(#gfill)" />}
        {paths.red && <path d={paths.red} fill="url(#rfill)" />}
        <line x1={PAD_L} x2={W - PAD_R} y1={midY} y2={midY} stroke="var(--red)" strokeOpacity="0.7" strokeWidth="1.5" />
        {paths.line && <path d={paths.line} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" />}

        {/* user overlay from an uploaded model */}
        {overlay && overlay.points.length > 1 && (
          <path
            d={overlay.points
              .map(([f, wp], i) => `${i === 0 ? 'M' : 'L'}${px(Math.min(1, Math.max(0, f))).toFixed(1)},${py(Math.min(1, Math.max(0, wp))).toFixed(1)}`)
              .join('')}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}

        {/* hover crosshair */}
        {h != null && (
          <g>
            <line x1={px(geometry.xs[h])} x2={px(geometry.xs[h])} y1={PAD_T} y2={H - PAD_B} stroke="var(--muted)" strokeWidth="1" />
            <circle cx={px(geometry.xs[h])} cy={py(series[h])} r="4" fill="var(--green)" />
          </g>
        )}
      </svg>

      {h != null && hd && (
        <div
          className="absolute panel-inset px-3 py-2 text-[11px] pointer-events-none z-10"
          style={{
            left: `${Math.min(82, Math.max(2, (px(geometry.xs[h]) / W) * 100))}%`,
            top: 8,
          }}
        >
          <div className="label-faint mb-1">
            {hd.period <= 4 ? `Q${hd.period}` : `OT${hd.period - 4 > 1 ? hd.period - 4 : ''}`} · {hd.clock}
          </div>
          <div className="font-bold">
            {game.home.abbrev} {hd.homeScore} - {hd.awayScore} {game.away.abbrev}
          </div>
          <div className="mt-1">
            <span className="text-green">{game.home.abbrev} {(series[h] * 100).toFixed(1)}%</span>
            <span className="text-faint"> / </span>
            <span className="text-red">{game.away.abbrev} {((1 - series[h]) * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
