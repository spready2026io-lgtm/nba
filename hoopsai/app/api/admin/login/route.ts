import { NextRequest, NextResponse } from 'next/server';
import { adminCookieValue, ADMIN_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return NextResponse.json({ error: 'Admin is disabled: ADMIN_PASSWORD is not set.' }, { status: 503 });
  let password: string;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (password !== pw) return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12,
    path: '/',
  });
  return res;
}
