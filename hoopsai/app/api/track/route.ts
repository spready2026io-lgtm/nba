// POST /api/track {kind}: admin-page counters. Called once per game-room mount.

import { NextRequest, NextResponse } from 'next/server';
import { bumpCounter } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { kind } = await req.json();
    if (kind === 'dashboard') await bumpCounter('dashboardViews');
    else return NextResponse.json({ ok: false }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
