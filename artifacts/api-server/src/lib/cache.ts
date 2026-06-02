interface CacheEntry { data: unknown; expiresAt: number; }
const store = new Map<string, CacheEntry>();

// Hard cap on cache size — prevents unbounded memory growth if a future
// code path accidentally uses dynamic keys.
const MAX_CACHE_ENTRIES = 500;

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  // If at capacity and this is a new key, evict the oldest entry first.
  if (store.size >= MAX_CACHE_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
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
