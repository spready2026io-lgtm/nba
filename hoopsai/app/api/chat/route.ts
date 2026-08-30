// Shimi's chat. claude-opus-5 per the estate decision (2026-08-04), with the
// server-side refusal fallback enabled as recommended for Opus 5 code. When no
// ANTHROPIC_API_KEY is configured the deterministic branch answers what the
// model math can answer and says plainly what it cannot.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { homeWinProb, modelMeta, volatilityLabel } from '@/lib/model/shimi';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = {
  gameId?: string;
  home?: { abbrev?: string; name?: string; score?: number };
  away?: { abbrev?: string; name?: string; score?: number };
  statusDetail?: string;
  status?: string;
  wp?: number;
  vol?: number;
  mom?: number;
  spreadHome?: number | null;
  adjustHome?: number | null;
};

const SHIMI_SYSTEM = `You are Shimi, HoopsAi's resident sports data scientist and basketball analyst, named in memory of Simi Riger, the legendary American-Israeli NBA commentator. You are 38, born in New York a few blocks from Madison Square Garden, BA in Mathematics and PhD in Sport Science from Carnegie Mellon. You build the win-probability model this site runs on: a logistic regression trained on real NBA play-by-play (score margin against time remaining, decaying pregame line prior, home advantage).

You chat with NBA fans during games about win probability, momentum, volatility, and game flow. You are warm, chatty, and direct, a New Yorker who loves this sport.

Hard rules, no exceptions:
0. You are an AI analyst. The Shimi persona (the bio above) is HoopsAi's tribute character, and you never pretend otherwise: asked whether you are human, real, or about your nature, say plainly that you are HoopsAi's AI analyst, built on this model, and the bio is the character the product gave you.
1. Never invent statistics, scores, player numbers, or facts. You know exactly what the CURRENT GAME STATE block says, plus general public basketball knowledge up to your training data. If asked for a number you do not have (live player stats, injuries, today's lineups), say you do not have it in front of you.
2. Probabilities you quote for THIS game come from the game state block. You may reason about hypotheticals with your model's logic (margin over root time, prior decay) and say that is what you are doing.
3. You are analysis, not betting advice. If asked what to bet, share the model read and the edge arithmetic, and remind the fan it is model output, they decide, bet responsibly.
4. House style: never use em dashes or en dashes. Use commas, periods, or colons.
5. Keep replies tight: two to five sentences unless the fan asks for depth.`;

function deterministicReply(text: string, ctx: Ctx): string {
  const lower = text.toLowerCase();
  const home = ctx.home?.abbrev ?? 'the home team';
  const away = ctx.away?.abbrev ?? 'the away team';
  const wp = typeof ctx.wp === 'number' ? ctx.wp : null;

  if (lower.includes('simulate ot') || lower.includes('overtime')) {
    const otWp = homeWinProb(0, 300, ctx.spreadHome ?? null, ctx.adjustHome ?? 0);
    return (
      `Tied with 5:00 of overtime to play, my model reads it ` +
      `${home} ${(otWp * 100).toFixed(1)}%, ${away} ${((1 - otWp) * 100).toFixed(1)}%. ` +
      `Margin is zero and the pregame prior is about 90% decayed by then, so this is mostly the home floor talking.`
    );
  }
  if (lower.includes('volatility')) {
    const vol = ctx.vol ?? 0;
    return (
      `Volatility here is ${vol} out of 100, ${volatilityLabel(vol).toLowerCase()}. ` +
      `I compute it as the total win-probability ground covered so far, scaled against the 95th percentile of the ${modelMeta.games} games in my corpus. ` +
      `High volatility means the model kept changing its mind, which is where live bettors find their edges.`
    );
  }
  if (lower.includes('matchup') || lower.includes('player')) {
    return (
      `Player-level matchup data is not wired into my v1 model, and I will not make numbers up. ` +
      `What I can tell you is the game-level read: ` +
      (wp != null ? `${home} ${(wp * 100).toFixed(1)}% against ${away} right now.` : `upload the game and I will run it.`) +
      ` Full chat analysis comes online when the site's analysis service is connected.`
    );
  }
  return (
    `My full chat brain is offline right now (the analysis service is not connected), but the model itself is live. ` +
    (wp != null ? `Current read: ${home} ${(wp * 100).toFixed(1)}%, ${away} ${((1 - wp) * 100).toFixed(1)}%. ` : '') +
    `Ask me to "simulate OT" or run a "volatility check" and I will answer from the model math directly.`
  );
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`chat:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ reply: 'Easy, easy. Give me a few minutes to catch my breath, then ask again.' }, { status: 429 });
  }
  let body: { messages?: { role: string; content: string }[]; context?: Ctx };
  try {
    body = await req.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const raw = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 2000) }));
  // the Messages API requires the first message to be a user turn; a trimmed
  // history can start with an assistant turn, which would 400 every call
  while (messages.length > 0 && messages[0].role === 'assistant') messages.shift();
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'no user message' }, { status: 400 });
  }
  const ctx = body.context ?? {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ reply: deterministicReply(messages[messages.length - 1].content, ctx), offline: true });
  }

  const stateBlock =
    `CURRENT GAME STATE (authoritative, from Shimi's model):\n` +
    `Game: ${ctx.away?.name ?? '?'} at ${ctx.home?.name ?? '?'} (${ctx.statusDetail ?? '?'})\n` +
    `Score: ${ctx.home?.abbrev ?? 'HOME'} ${ctx.home?.score ?? '?'} - ${ctx.away?.score ?? '?'} ${ctx.away?.abbrev ?? 'AWAY'}\n` +
    `Model home win probability: ${ctx.wp != null ? (ctx.wp * 100).toFixed(1) + '%' : 'n/a'}\n` +
    `Volatility index: ${ctx.vol ?? 'n/a'}/100 · Momentum (recent stretch, home-positive): ${ctx.mom != null ? (ctx.mom * 100).toFixed(1) + '%' : 'n/a'}\n` +
    `Pregame home spread: ${ctx.spreadHome ?? 'not available'} · User model prior adjustment: ${ctx.adjustHome ?? 'none'}\n` +
    `Model card: v${modelMeta.version}, ${modelMeta.games} games, holdout accuracy ${(modelMeta.holdout.accuracy * 100).toFixed(1)}%, Brier ${modelMeta.holdout.brier.toFixed(3)}.`;

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: SHIMI_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: stateBlock },
      ],
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ reply: 'I will pass on that one. Ask me about the game, the model, or the numbers on screen.' });
    }
    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return NextResponse.json({ reply: reply || 'I came up empty there. Try rephrasing?' });
  } catch (e) {
    console.error('[chat] Anthropic call failed:', e);
    return NextResponse.json({ reply: deterministicReply(messages[messages.length - 1].content, ctx), offline: true });
  }
}
