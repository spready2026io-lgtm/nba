// Storage adapter. Local JSON files under .data/ in development; Vercel Blob in
// production when BLOB_READ_WRITE_TOKEN is present (same pattern as Lizzy).
// Collections are small (users, counters, sources), read-modify-write whole files.
//
// Two hardening notes (2026-08-30 review):
// - Vercel Blob objects are public; collections holding PII (users) must not sit
//   at a guessable path. Every blob path is namespaced under an HMAC of the
//   collection name keyed by HOOPSAI_SECRET, so the URL is as secret as the key.
// - Read-modify-write is serialized per collection via withLock. This holds
//   within one server instance; concurrent writes from parallel serverless
//   instances can still race. Acceptable at current traffic; a real KV store is
//   the fix if counters ever need to be exact under load.

import fs from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import type { Counters, UploadedSource, User } from './types';

const DATA_DIR = path.join(process.cwd(), '.data');
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

function storeSecret(): string {
  const s = process.env.HOOPSAI_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production' && useBlob) {
    throw new Error('HOOPSAI_SECRET must be set in production (blob paths are keyed by it)');
  }
  return 'hoopsai-dev-secret-not-for-production';
}

function blobPath(kind: 'store' | 'uploads', name: string): string {
  const ns = createHmac('sha256', storeSecret()).update(`path:${kind}`).digest('hex').slice(0, 24);
  return `${kind}-${ns}/${name}`;
}

async function blobModule() {
  return import('@vercel/blob');
}

// ---- per-collection write serialization (single-instance) ----

const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(name) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(name, next);
  try {
    return await next;
  } finally {
    if (locks.get(name) === next) locks.delete(name);
  }
}

async function readCollection<T>(name: string, fallback: T): Promise<T> {
  if (useBlob) {
    try {
      const { list } = await blobModule();
      const { blobs } = await list({ prefix: blobPath('store', `${name}.json`), limit: 1 });
      if (blobs.length === 0) return fallback;
      const r = await fetch(blobs[0].url, { cache: 'no-store' });
      if (!r.ok) return fallback;
      return (await r.json()) as T;
    } catch (e) {
      console.error(`[store] blob read ${name} failed:`, e);
      return fallback;
    }
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8');
    return JSON.parse(raw) as T;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') console.error(`[store] local read ${name} failed:`, e);
    return fallback;
  }
}

async function writeCollection<T>(name: string, value: T): Promise<void> {
  if (useBlob) {
    const { put } = await blobModule();
    await put(blobPath('store', `${name}.json`), JSON.stringify(value), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(value, null, 2));
}

// ---- users ----

export async function getUsers(): Promise<User[]> {
  return readCollection<User[]>('users', []);
}

export async function saveUsers(users: User[]): Promise<void> {
  await writeCollection('users', users);
}

// ---- counters ----

const ZERO: Counters = { registrations: 0, dashboardViews: 0, filesUploaded: 0 };

export async function getCounters(): Promise<Counters> {
  return readCollection<Counters>('counters', { ...ZERO });
}

export async function bumpCounter(key: keyof Counters, by = 1): Promise<void> {
  await withLock('counters', async () => {
    const c = await getCounters();
    c[key] = (c[key] ?? 0) + by;
    await writeCollection('counters', c);
  });
}

// ---- uploaded sources ----

export async function getSources(): Promise<UploadedSource[]> {
  return readCollection<UploadedSource[]>('sources', []);
}

export async function addSource(entry: UploadedSource): Promise<void> {
  await withLock('sources', async () => {
    const sources = await getSources();
    sources.push(entry);
    await writeCollection('sources', sources);
  });
}

// ---- uploaded file payloads ----

export async function saveUploadPayload(id: string, buf: Buffer, contentType: string): Promise<void> {
  if (useBlob) {
    const { put } = await blobModule();
    await put(blobPath('uploads', id), buf, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  await fs.mkdir(path.join(DATA_DIR, 'uploads'), { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'uploads', id), buf);
}

export async function readUploadPayload(id: string): Promise<Buffer | null> {
  if (useBlob) {
    try {
      const { list } = await blobModule();
      const { blobs } = await list({ prefix: blobPath('uploads', id), limit: 1 });
      if (blobs.length === 0) return null;
      const r = await fetch(blobs[0].url, { cache: 'no-store' });
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.error(`[store] blob upload read ${id} failed:`, e);
      return null;
    }
  }
  try {
    return await fs.readFile(path.join(DATA_DIR, 'uploads', id));
  } catch {
    return null;
  }
}
