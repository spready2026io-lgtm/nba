// Minimal in-memory sliding-window rate limiter. Per server instance only:
// parallel serverless instances each carry their own window, so treat the
// numbers as a cost brake, not a security boundary.

const windows = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 10_000) windows.clear(); // crude memory cap
  return true;
}

export function clientKey(req: { headers: Headers }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
