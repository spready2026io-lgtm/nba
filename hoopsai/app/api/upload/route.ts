// POST multipart {file}: registered users upload a CSV or PDF model source.
// CSV formats Shimi reads directly (documented on the Knowledge Hub):
//   metric,value            with a home_prior_adjust,<points> row  -> prior adjustment
//   game_fraction,home_wp   rows 0..1                              -> chart overlay
// PDFs: text extracted; with an Anthropic key Shimi summarizes and pulls an
// adjustment if one is stated; without one the file is stored and says so.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { currentUser } from '@/lib/auth';
import { addSource, bumpCounter, saveUploadPayload } from '@/lib/store';
import { rateLimit } from '@/lib/rate-limit';
import type { UploadedSource } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel route handler body limit is ~4.5MB
const ADJUST_CAP = 10; // points; a user prior beyond +-10 is a typo or an attack

function parseCsv(text: string): { adjustHome: number | null; overlay: UploadedSource['overlay']; summary: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { adjustHome: null, overlay: null, summary: 'CSV had no data rows; nothing applied.' };
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());

  if (header.includes('metric') && header.includes('value')) {
    const mi = header.indexOf('metric');
    const vi = header.indexOf('value');
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      if ((cells[mi] ?? '').trim().toLowerCase() === 'home_prior_adjust') {
        const v = parseFloat(cells[vi]);
        if (Number.isFinite(v)) {
          const clamped = Math.max(-ADJUST_CAP, Math.min(ADJUST_CAP, v));
          return {
            adjustHome: clamped,
            overlay: null,
            summary: `Prior adjustment applied: home ${clamped >= 0 ? '+' : ''}${clamped} pts${clamped !== v ? ` (clamped from ${v})` : ''}.`,
          };
        }
      }
    }
    return { adjustHome: null, overlay: null, summary: 'No home_prior_adjust row found; nothing applied.' };
  }

  if (header.includes('game_fraction') && header.includes('home_wp')) {
    const fi = header.indexOf('game_fraction');
    const wi = header.indexOf('home_wp');
    const points: [number, number][] = [];
    for (const line of lines.slice(1, 2001)) {
      const cells = line.split(',');
      const f = parseFloat(cells[fi]);
      const wp = parseFloat(cells[wi]);
      if (Number.isFinite(f) && Number.isFinite(wp) && f >= 0 && f <= 1 && wp >= 0 && wp <= 1) points.push([f, wp]);
    }
    if (points.length >= 2) {
      points.sort((a, b) => a[0] - b[0]);
      return { adjustHome: null, overlay: { label: 'user model', points }, summary: `Win-probability overlay loaded: ${points.length} points.` };
    }
    return { adjustHome: null, overlay: null, summary: 'Overlay CSV had fewer than 2 valid points; nothing applied.' };
  }

  return {
    adjustHome: null,
    overlay: null,
    summary: 'CSV stored. Recognized formats: metric,value (home_prior_adjust) or game_fraction,home_wp. Neither header found.',
  };
}

async function readPdf(buf: Buffer): Promise<{ adjustHome: number | null; summary: string }> {
  let text = '';
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      text = result.text?.slice(0, 20000) ?? '';
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    console.error('[upload] pdf text extraction failed:', e);
    return { adjustHome: null, summary: 'PDF stored, but the text could not be extracted.' };
  }
  if (!text.trim()) return { adjustHome: null, summary: 'PDF stored; it contains no extractable text (likely a scan).' };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { adjustHome: null, summary: 'PDF stored with extracted text. Shimi reads PDFs once the analysis service is connected.' };
  }
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system:
        'You extract betting-model parameters from user documents for HoopsAi. Reply with STRICT JSON only: ' +
        '{"summary": "<one sentence, what the document claims>", "home_prior_adjust": <number or null>}. ' +
        'home_prior_adjust is a points adjustment to the home team pregame prior ONLY if the document explicitly states one; otherwise null. Never invent one. No em dashes.',
      messages: [{ role: 'user', content: `Document text:\n\n${text}` }],
    });
    const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const adj = typeof parsed.home_prior_adjust === 'number' ? Math.max(-ADJUST_CAP, Math.min(ADJUST_CAP, parsed.home_prior_adjust)) : null;
      return { adjustHome: adj, summary: String(parsed.summary ?? 'PDF read by Shimi.').slice(0, 300) };
    }
    return { adjustHome: null, summary: 'PDF read, but Shimi found no extractable model parameters.' };
  } catch (e) {
    console.error('[upload] Shimi PDF read failed:', e);
    return { adjustHome: null, summary: 'PDF stored; Shimi could not analyze it right now.' };
  }
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Register and sign in to upload models.' }, { status: 401 });
  if (!rateLimit(`upload:${user.username}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Upload limit reached (10 per hour). Try again later.' }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (4 MB max).' }, { status: 413 });

  const name = file.name.slice(0, 120);
  const isCsv = /\.csv$/i.test(name);
  const isPdf = /\.pdf$/i.test(name);
  if (!isCsv && !isPdf) return NextResponse.json({ error: 'Only CSV and PDF files are supported.' }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomBytes(8).toString('hex');
  await saveUploadPayload(id, buf, isCsv ? 'text/csv' : 'application/pdf');

  let result: { adjustHome: number | null; overlay?: UploadedSource['overlay']; summary: string };
  if (isCsv) result = parseCsv(buf.toString('utf8'));
  else result = await readPdf(buf);

  const entry: UploadedSource = {
    id,
    username: user.username,
    kind: isCsv ? 'csv' : 'pdf',
    name,
    size: file.size,
    status: 'synced',
    addedAt: new Date().toISOString(),
    summary: result.summary,
    overlay: result.overlay ?? null,
    adjustHome: result.adjustHome,
  };
  await addSource(entry);
  await bumpCounter('filesUploaded');
  return NextResponse.json({ ok: true, source: entry });
}
