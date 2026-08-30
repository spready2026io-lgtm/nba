'use client';

// Model-derived betting slip. Every number on it comes from Shimi's model or the
// pregame bookmaker line; the disclaimer is part of the product, not decoration.

import { useEffect, useRef } from 'react';
import type { GameData, SlipLeg } from '@/lib/types';

export default function BetSlipModal({ legs, game, onClose }: { legs: SlipLeg[]; game: GameData; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const copy = async () => {
    const text = [
      `HoopsAi slip · ${game.away.abbrev} @ ${game.home.abbrev} · ${game.statusDetail}`,
      ...legs.map((l) => `${l.market}: ${l.pick} · model ${(l.modelWp * 100).toFixed(1)}%${l.impliedWp != null ? ` vs implied ${(l.impliedWp * 100).toFixed(1)}%` : ''}`),
      'Model output, not betting advice. Bet responsibly, 18+.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable; the slip stays on screen to copy by hand
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-label="betting slip" className="panel p-5 w-full max-w-md outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="label" style={{ color: 'var(--green)' }}>Prop predictor · betting slip</div>
          <button className="text-muted hover:text-[var(--text)] cursor-pointer" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="label-faint mb-4">
          {game.away.abbrev} @ {game.home.abbrev} · {game.statusDetail}
        </div>

        <div className="space-y-3">
          {legs.map((l, i) => (
            <div key={i} className="panel-inset p-3">
              <div className="flex items-center justify-between">
                <span className="label-faint">{l.market}</span>
                {l.edge != null && (
                  <span className={`text-[10px] font-bold ${l.edge >= 0 ? 'text-green' : 'text-red'}`}>
                    {l.edge >= 0 ? '+' : ''}{(l.edge * 100).toFixed(1)}% vs pregame line
                  </span>
                )}
              </div>
              <div className="font-bold text-[14px] mt-1">{l.pick}</div>
              <div className="text-[11px] text-muted mt-1 leading-relaxed">{l.note}</div>
            </div>
          ))}
          {legs.length === 0 && <div className="label-faint">No play-by-play yet; the slip needs a live model state.</div>}
        </div>

        <button className="btn w-full mt-4" onClick={copy}>Copy slip</button>
        <p className="label-faint mt-3 leading-relaxed normal-case tracking-normal">
          Shimi&apos;s slip is model output for information only, not betting advice. Odds move; verify prices with your bookmaker. Bet responsibly, 18+.
        </p>
      </div>
    </div>
  );
}
