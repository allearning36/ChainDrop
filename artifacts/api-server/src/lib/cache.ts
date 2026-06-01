interface CacheEntry { data: unknown; expiresAt: number; }
const store = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.expiresAt) store.delete(k);
}, 60_000);
