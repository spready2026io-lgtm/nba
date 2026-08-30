// POST {username, email, consent}: create a pending user and send the
// verification link. The link is only ever returned in the response body in
// non-production with no mail key configured (the documented dev fallback);
// in production a failed send is an error, never a token disclosure.

import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/mailer';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!rateLimit(`register:${clientKey(req)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }
  let body: { username?: string; email?: string; consent?: boolean };
  try {
    body = await req.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const result = await registerUser(String(body.username ?? '').trim(), String(body.email ?? '').trim(), !!body.consent);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const origin = req.nextUrl.origin;
  const link = `${origin}/verify?token=${result.token}`;
  const mail = await sendVerificationEmail(String(body.email).trim(), link);

  if (mail.sent) return NextResponse.json({ ok: true, sent: true });

  // Dev fallback ONLY: outside production, with no mail key, surface the link.
  if (process.env.NODE_ENV !== 'production' && mail.reason === 'no-api-key') {
    return NextResponse.json({ ok: true, sent: false, devLink: mail.devLink });
  }
  // Production send failure: the token stays server-side. Details are in the logs.
  return NextResponse.json(
    { error: 'We could not send the verification email right now. Try again in a few minutes.' },
    { status: 502 }
  );
}
