import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { username: user.username, email: user.email } });
}
