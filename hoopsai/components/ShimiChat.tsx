'use client';

// Chat with Shimi about this game's win probability. The server route answers
// with the Claude API when a key is configured; the deterministic fallback
// answers the model-math questions (volatility, OT simulation) without one.

import { useEffect, useRef, useState } from 'react';
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

export default function ShimiChat({ game, wp, vol, mom, spreadHome, adjustHome }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Pin the transcript to its newest message by scrolling the list's OWN box.
  // scrollIntoView would scroll every ancestor including the document, so on
  // mount it dragged the whole page down to the chat and a game room opened
  // partway down instead of at the top.
  useEffect(() => {
    if (messages.length === 0) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

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
      setMessages((m) => [...m, { role: 'assistant', content: d.reply ?? 'Something went wrong on my end. Try again.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not reach the analysis service. Try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        ref={listRef}
        className="space-y-2 max-h-64 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="conversation with Shimi"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="panel-inset px-3 py-2 text-[12px] leading-relaxed max-w-[85%] whitespace-pre-wrap"
              style={m.role === 'user' ? { borderColor: 'var(--border-strong)', background: 'var(--panel-3)' } : {}}
            >
              {m.role === 'assistant' && <div className="label-faint mb-1">Shimi</div>}
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="label-faint">Shimi is running the numbers...</div>}
      </div>

      <div className="flex gap-2 mt-3">
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
    </div>
  );
}
