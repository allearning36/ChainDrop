import { logger } from "./logger";

/**
 * Parse rpcUrls JSON column into a string array.
 * Falls back to the legacy single rpcUrl if the array is empty or invalid.
 */
export function parseRpcUrls(
  rpcUrlsJson: string | null | undefined,
  fallbackRpcUrl: string
): string[] {
  if (rpcUrlsJson) {
    try {
      const parsed: unknown = JSON.parse(rpcUrlsJson);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
        if (filtered.length > 0) return filtered;
      }
    } catch {
      // fall through
    }
  }
  return [fallbackRpcUrl];
}

/**
 * Try each RPC URL in priority order.
 * Each URL gets up to MAX_RETRIES attempts with exponential backoff before switching.
 */
export async function withRpcFailover<T>(
  rpcUrls: string[],
  fn: (rpcUrl: string) => Promise<T>,
  label = "rpc-call"
): Promise<T> {
  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 400;
  let lastError: unknown;

  for (let i = 0; i < rpcUrls.length; i++) {
    const url = rpcUrls[i];
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await fn(url);
        if (i > 0 || attempt > 0) {
          logger.info({ rpcUrl: url, rpcIndex: i, attempt: attempt + 1, label }, "RPC failover succeeded");
        }
        return result;
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        const isLastRpc = i === rpcUrls.length - 1;

        if (!isLastAttempt) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn(
            { rpcUrl: url, attempt: attempt + 1, delayMs: delay, label, err },
            `RPC attempt ${attempt + 1} failed, retrying in ${delay}ms`
          );
          await new Promise<void>((r) => setTimeout(r, delay));
        } else if (!isLastRpc) {
          logger.warn(
            { failedRpc: url, nextRpc: rpcUrls[i + 1], label },
            "RPC exhausted retries, switching to next RPC"
          );
        }
      }
    }
  }

  throw lastError;
}

/**
 * Check the health of a single RPC URL.
 * Sends a minimal JSON-RPC request and measures latency.
 */
export async function checkRpcHealth(url: string): Promise<{
  url: string;
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    await resp.text();
    return { url, status: "ok", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url, status: "error", latencyMs: Date.now() - start, error: msg };
  }
}
