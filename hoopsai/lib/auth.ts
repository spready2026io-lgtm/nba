// Session + registration logic. HMAC-signed cookie sessions, email verification
// tokens. Fail-closed: any production build (NODE_ENV=production) without
// HOOPSAI_SECRET refuses to sign rather than falling back to the dev secret.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getUsers, saveUsers, bumpCounter, withLock } from './store';
import type { User } from './types';

const DEV_SECRET = 'hoopsai-dev-secret-not-for-production';
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // must match the cookie maxAge

export function secret(): string {
  const s = process.env.HOOPSAI_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('HOOPSAI_SECRET must be set in production');
  return DEV_SECRET;
}

export const SESSION_COOKIE = 'hoopsai_session';
export const ADMIN_COOKIE = 'hoopsai_admin';

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username, t: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): { username: string } | null {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expect = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.u !== 'string' || typeof data.t !== 'number') return null;
    if (Date.now() - data.t > SESSION_MAX_AGE_MS) return null; // server-side expiry, not just the cookie's
    return { username: data.u };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const sess = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!sess) return null;
  const users = await getUsers();
  return users.find((u) => u.username === sess.username && u.verified) ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const jar = await cookies();
  const val = jar.get(ADMIN_COOKIE)?.value;
  return val === sign(`admin:${pw}`);
}

export function adminCookieValue(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('ADMIN_PASSWORD not set');
  return sign(`admin:${pw}`);
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function registerUser(
  username: string,
  email: string,
  consent: boolean
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!USERNAME_RE.test(username)) return { ok: false, error: 'Username must be 3-24 characters: letters, digits, dot, dash, underscore.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'That email address does not look valid.' };
  if (!consent) return { ok: false, error: 'You need to approve receiving email from HoopsAi to register.' };
  return withLock('users', async () => {
    const users = await getUsers();
    const lower = username.toLowerCase();
    const emailLower = email.toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === lower)) return { ok: false as const, error: 'That username is taken.' };
    const existing = users.find((u) => u.email.toLowerCase() === emailLower);
    if (existing?.verified) return { ok: false as const, error: 'That email is already registered.' };
    const token = randomBytes(24).toString('base64url');
    const user: User = {
      username,
      email,
      consent,
      verified: false,
      verifyToken: token,
      createdAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, user);
    else users.push(user);
    await saveUsers(users);
    return { ok: true as const, token };
  });
}

export async function verifyEmailToken(token: string): Promise<User | null> {
  if (!token) return null;
  const user = await withLock('users', async () => {
    const users = await getUsers();
    const u = users.find((x) => x.verifyToken === token && !x.verified);
    if (!u) return null;
    u.verified = true;
    u.verifiedAt = new Date().toISOString();
    delete u.verifyToken;
    await saveUsers(users);
    return u;
  });
  if (user) await bumpCounter('registrations');
  return user;
}
