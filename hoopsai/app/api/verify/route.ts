// POST {token}: verify the email token, activate the account, set the session.

import { NextRequest, NextResponse } from 'next/server';
import { encodeSession, verifyEmailToken, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let token: string;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const user = await verifyEmailToken(String(token ?? ''));
  if (!user) return NextResponse.json({ error: 'This verification link is invalid or was already used.' }, { status: 400 });

  const res = NextResponse.json({ ok: true, username: user.username });
  res.cookies.set(SESSION_COOKIE, encodeSession(user.username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  });
  return res;
}
