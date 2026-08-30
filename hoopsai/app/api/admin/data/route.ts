import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getCounters, getUsers } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [counters, users] = await Promise.all([getCounters(), getUsers()]);
  return NextResponse.json({
    counters,
    users: users.map((u) => ({
      username: u.username,
      email: u.email,
      consent: u.consent,
      verified: u.verified,
      createdAt: u.createdAt,
      verifiedAt: u.verifiedAt ?? null,
    })),
  });
}
