// Storage adapter. Local JSON files under .data/ in development; Vercel Blob in
// production when BLOB_READ_WRITE_TOKEN is present.
//
// Blobs are written PRIVATE: users.json holds emails and pending verification
// tokens, and uploads hold user documents, so none of it may sit behind a
// public URL. Reads go through get() with the store token, never a plain fetch.
// Reads also pass useCache:false, because a CDN-cached read in a
// read-modify-write cycle silently reverts other writes.
//
// Write serialization (withLock) holds within one server instance; concurrent
// writes from parallel serverless instances can still race. Acceptable at
// current traffic. A real KV store is the fix if counters must be exact.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Counters, UploadedSource, User } from './types';

const DATA_DIR = path.join(process.cwd(), '.data');
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

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

async function readBlobText(pathname: string): Promise<string | null> {
  const { get } = await blobModule();
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || !res.stream) return null;
  return await new Response(res.stream).text();
}

async function readCollection<T>(name: string, fallback: T): Promise<T> {
  if (useBlob) {
    try {
      const raw = await readBlobText(`store/${name}.json`);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch (e) {
      // BlobNotFoundError on first read is expected; anything else is a real fault
      if ((e as Error)?.name !== 'BlobNotFoundError') console.error(`[store] blob read ${name} failed:`, e);
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
    await put(`store/${name}.json`, JSON.stringify(value), {
      access: 'private',
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
    await put(`uploads/${id}`, buf, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  await fs.mkdir(path.join(DATA_DIR, 'uploads'), { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'uploads', id), buf);
}

export async function readUploadPayload(id: string): Promise<Buffer | null> {
  if (useBlob) {
    try {
      const { get } = await blobModule();
      const res = await get(`uploads/${id}`, { access: 'private', useCache: false });
      if (!res || !res.stream) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    } catch (e) {
      if ((e as Error)?.name !== 'BlobNotFoundError') console.error(`[store] blob upload read ${id} failed:`, e);
      return null;
    }
  }
  try {
    return await fs.readFile(path.join(DATA_DIR, 'uploads', id));
  } catch {
    return null;
  }
}
