import { logger } from "./logger";

const ETH_ID = "ethereum";
const CACHE_TTL_MS = 60_000;

let cachedPrices: Record<string, number> = {};
let lastFetchAt = 0;
let pendingFetch: Promise<void> | null = null;
const neededIds = new Set<string>([ETH_ID]);

export function registerCoingeckoId(id: string | null | undefined): void {
  if (id && id.trim()) neededIds.add(id.trim());
}

async function doFetch(): Promise<void> {
  const ids = Array.from(neededIds).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { usd?: number }>;
    for (const [id, val] of Object.entries(data)) {
      if (typeof val?.usd === "number") cachedPrices[id] = val.usd;
    }
    lastFetchAt = Date.now();
    logger.info({ ids, count: Object.keys(cachedPrices).length }, "Price cache refreshed");
  } catch (err) {
    logger.warn({ err }, "CoinGecko price fetch failed — using stale cache");
  }
}

async function ensureFresh(): Promise<void> {
  if (Date.now() - lastFetchAt < CACHE_TTL_MS) return;
  if (pendingFetch) return pendingFetch;
  pendingFetch = doFetch().finally(() => { pendingFetch = null; });
  return pendingFetch;
}

/**
 * Convert a native token amount to its ETH equivalent using live CoinGecko prices.
 * Falls back to "0" if price data is unavailable.
 *
 * @param nativeAmount  - Amount in the source token (e.g. "0.5" BNB)
 * @param fromCoingeckoId - CoinGecko ID of the source token (e.g. "binancecoin")
 *                          Pass null/undefined to treat as already ETH.
 */
export async function convertToEth(
  nativeAmount: string,
  fromCoingeckoId: string | null | undefined,
): Promise<string> {
  const amount = parseFloat(nativeAmount);
  if (isNaN(amount) || amount <= 0) return "0";
  if (!fromCoingeckoId || fromCoingeckoId === ETH_ID) return nativeAmount;

  registerCoingeckoId(fromCoingeckoId);

  await ensureFresh();

  const fromUsd = cachedPrices[fromCoingeckoId];
  const ethUsd = cachedPrices[ETH_ID];

  if (!fromUsd || !ethUsd || ethUsd === 0) {
    logger.warn({ fromCoingeckoId, fromUsd, ethUsd }, "Missing price data for commission conversion — skipping commission");
    return "0";
  }

  const ethAmount = (amount * fromUsd) / ethUsd;
  return ethAmount.toFixed(10);
}

export function getCachedPrice(coingeckoId: string): number | null {
  return cachedPrices[coingeckoId] ?? null;
}
