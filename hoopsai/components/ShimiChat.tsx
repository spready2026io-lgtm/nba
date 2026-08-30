'use client';

// Chat with Shimi about this game's win probability. The server route answers
// with the Claude API when a key is configured; the deterministic fallback
// answers the model-math questions (volatility, OT simulation) without one.
//
// Layout: the input sits directly under Shimi's name and the transcript runs
// below it, so a reply appears right where the reader is already looking.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameData } from '@/lib/types';

type Msg = { role: 'user' | 'assistant'; content: string };

type Props = {
  game: GameData;
  wp: number;
  vol: number;
  mom: number;
  spreadHome: number | null;
  adjustHome: number | null;
};

const CHIPS = ['Simulate OT', 'Volatility check', 'Player matchups'];

// Every reply finishes in roughly the same time regardless of length, so a long
// answer does not crawl and a short one does not flash past.
const REVEAL_TICKS = 260;
const TICK_MS = 16;

export default function ShimiChat({ game, wp, vol, mom, spreadHome, adjustHome }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ index: number; chars: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<Set<number>>(new Set());

  // Pin the transcript to its newest text by scrolling the list's OWN box.
  // scrollIntoView would scroll every ancestor including the document, which
  // used to drag the whole page down to the chat on mount.
  useEffect(() => {
    if (messages.length === 0) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, reveal]);

  const startReveal = useCallback((index: number, content: string) => {
    if (animatedRef.current.has(index)) return;
    animatedRef.current.add(index);
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || content.length === 0) return; // show it whole, no animation
    setReveal({ index, chars: 0 });
  }, []);

  // Advance the typewriter. Every state change happens inside the timeout, and
  // finishing is folded into the updater, so the effect body never sets state.
  useEffect(() => {
    if (!reveal) return;
    const full = messages[reveal.index]?.content ?? '';
    const step = Math.max(1, Math.ceil(full.length / REVEAL_TICKS));
    const t = setTimeout(() => {
      setReveal((r) => {
        if (!r) return r;
        const chars = r.chars + step;
        return chars >= full.length ? null : { ...r, chars };
      });
    }, TICK_MS);
    return () => clearTimeout(t);
  }, [reveal, messages]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...messages, { role: 'user' as const, content: t }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // odd count: history alternates and must reach the API user-first
          messages: next.slice(-11),
          context: {
            gameId: game.id,
            home: game.home,
            away: game.away,
            statusDetail: game.statusDetail,
            status: game.status,
            wp,
            vol,
            mom,
            spreadHome,
            adjustHome,
          },
        }),
      });
      const d = await r.json();
      const reply = d.reply ?? 'Something went wrong on my end. Try again.';
      setMessages((m) => {
        startReveal(m.length, reply);
        return [...m, { role: 'assistant', content: reply }];
      });
    } catch {
      const reply = 'I could not reach the analysis service. Try again in a moment.';
      setMessages((m) => {
        startReveal(m.length, reply);
        return [...m, { role: 'assistant', content: reply }];
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* input first, directly under Shimi's name */}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Ask about win probability, momentum, or game flow..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          aria-label="chat with Shimi"
        />
        <button className="btn btn-green !px-4" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="send">
          ➤
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {CHIPS.map((c) => (
          <button key={c} className="btn btn-ghost !py-1.5 !px-3 !text-[10px]" onClick={() => send(c)} disabled={busy}>
            {c}
          </button>
        ))}
      </div>

      {(messages.length > 0 || busy) && (
        <div
          ref={listRef}
          className="space-y-2 max-h-64 overflow-y-auto mt-3"
          role="log"
          aria-live="polite"
          aria-label="conversation with Shimi"
        >
          {messages.map((m, i) => {
            const typing = reveal?.index === i;
            const shown = typing ? m.content.slice(0, reveal.chars) : m.content;
            return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="panel-inset px-3 py-2 text-[12px] leading-relaxed max-w-[85%] whitespace-pre-wrap"
                  style={m.role === 'user' ? { borderColor: 'var(--border-strong)', background: 'var(--panel-3)' } : {}}
                >
                  {m.role === 'assistant' && <div className="label-faint mb-1">Shimi</div>}
                  {/* the animated text is hidden from assistive tech, which reads
                      the complete reply once from the sibling instead */}
                  <span aria-hidden="true">
                    {shown}
                    {typing && <span className="caret" />}
                  </span>
                  <span className="sr-only">{m.content}</span>
                </div>
              </div>
            );
          })}
          {busy && <div className="label-faint">Shimi is running the numbers...</div>}
        </div>
      )}
    </div>
  );
}
