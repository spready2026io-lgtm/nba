// GET: the signed-in user's data sources. POST {url}: connect a live source URL.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { currentUser } from '@/lib/auth';
import { addSource, getSources } from '@/lib/store';
import type { UploadedSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ sources: [] });
  const sources = await getSources();
  return NextResponse.json({ sources: sources.filter((s) => s.username === user.username) });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Register and sign in to connect sources.' }, { status: 401 });
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'Only http(s) sources are supported.' }, { status: 400 });
  }

  const entry: UploadedSource = {
    id: randomBytes(8).toString('hex'),
    username: user.username,
    kind: 'url',
    name: parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : ''),
    status: 'synced',
    addedAt: new Date().toISOString(),
    summary: 'Reference link saved. URL feeds are not wired into the model yet; CSV and PDF uploads are.',
    overlay: null,
    adjustHome: null,
  };
  await addSource(entry);
  return NextResponse.json({ ok: true, source: entry });
}
