import { useState, useEffect } from "react";
import { useGetFaucetHistory, getGetFaucetHistoryQueryKey } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, ShoppingCart, Droplets, ChevronLeft, ChevronRight, SlidersHorizontal, Gift } from "lucide-react";
import { formatTokenAmount } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function cleanUrl(url: string): string {
  return url.replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, "").replace(/\/+$/, "").trim();
}

function getExplorerUrl(chainName: string, txHash: string, explorerUrl?: string | null): string | null {
  if (explorerUrl) return `${cleanUrl(explorerUrl)}/tx/${txHash}`;
  const name = chainName.toLowerCase();
  if (name.includes("sepolia"))    return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (name.includes("ethereum"))   return `https://etherscan.io/tx/${txHash}`;
  if (name.includes("polygon"))    return `https://polygonscan.com/tx/${txHash}`;
  if (name.includes("base"))       return `https://basescan.org/tx/${txHash}`;
  if (name.includes("arbitrum"))   return `https://arbiscan.io/tx/${txHash}`;
  if (name.includes("optimism") || name.includes("op mainnet")) return `https://optimistic.etherscan.io/tx/${txHash}`;
  if (name.includes("bsc") || name.includes("binance")) return `https://bscscan.com/tx/${txHash}`;
  if (name.includes("avalanche"))  return `https://snowtrace.io/tx/${txHash}`;
  if (name.includes("fantom"))     return `https://ftmscan.com/tx/${txHash}`;
  return null;
}

interface PromoClaim {
  id: number;
  address: string;
  txHash: string;
  claimedAt: string;
  amount: string;
  chainId: number;
  chainName: string;
  symbol: string;
  logoUrl: string | null;
  explorerUrl: string | null;
}

type FeedItem =
  | { kind: "faucet"; id: number; type: string; chainName: string; symbol: string; logoUrl: string | null; address: string; amount: string; claimedAt: string; txHash: string; explorerUrl: string | null }
  | { kind: "promo";  id: number; chainName: string; symbol: string; logoUrl: string | null; address: string; amount: string; claimedAt: string; txHash: string; explorerUrl: string | null };

export function RecentFeed() {
  const { data: history = [] } = useGetFaucetHistory({
    query: {
      refetchInterval: 60000,
      queryKey: getGetFaucetHistoryQueryKey(),
    }
  });

  const [promoClaims, setPromoClaims] = useState<PromoClaim[]>([]);

  // Fetch promo claims once
  useEffect(() => {
    fetch("/api/promo/recent")
      .then(r => r.ok ? r.json() : [])
      .then((d: PromoClaim[]) => setPromoClaims(d))
      .catch(() => {});
  }, []);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [showSizeMenu, setShowSizeMenu] = useState(false);

  // Merge faucet + promo entries and sort by date desc
  const faucetItems: FeedItem[] = history.map(r => ({
    kind: "faucet" as const,
    id: r.id,
    type: r.type,
    chainName: r.chainName,
    symbol: r.symbol,
    logoUrl: r.logoUrl ?? null,
    address: r.address,
    amount: r.amount,
    claimedAt: r.claimedAt,
    txHash: r.txHash,
    explorerUrl: r.explorerUrl ?? null,
  }));

  const promoItems: FeedItem[] = promoClaims.map(p => ({
    kind: "promo" as const,
    id: p.id,
    chainName: p.chainName,
    symbol: p.symbol,
    logoUrl: p.logoUrl,
    address: p.address,
    amount: p.amount,
    claimedAt: p.claimedAt,
    txHash: p.txHash,
    explorerUrl: p.explorerUrl,
  }));

  const combined: FeedItem[] = [...faucetItems, ...promoItems].sort(
    (a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime()
  );

  if (combined.length === 0) return null;

  const totalPages = Math.ceil(combined.length / pageSize);
  const safeCurrentPage = Math.min(page, totalPages);
  const pageItems = combined.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const goTo = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  const pageTabs: number[] = [];
  const maxTabs = 5;
  let tabStart = Math.max(1, safeCurrentPage - Math.floor(maxTabs / 2));
  let tabEnd = Math.min(totalPages, tabStart + maxTabs - 1);
  if (tabEnd - tabStart < maxTabs - 1) tabStart = Math.max(1, tabEnd - maxTabs + 1);
  for (let i = tabStart; i <= tabEnd; i++) pageTabs.push(i);

  return (
    <div className="w-full max-w-4xl mx-auto my-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase" style={{ color: "rgba(255,255,255,0.85)" }}>
          Recent Drops
        </h2>
        <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, rgba(34,197,94,0.25) 0%, transparent 100%)" }} />
        <span
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg"
          style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)", color: "rgba(34,197,94,0.6)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          Live
        </span>
      </div>

      {/* Records list */}
      <div className="flex flex-col gap-2">
        {pageItems.map((record) => {
          const isBuy   = record.kind === "faucet" && record.type === "buy";
          const isPromo = record.kind === "promo";

          const accentColor = isPromo ? "168,85,247" : isBuy ? "129,140,248" : "34,197,94";

          return (
            <div
              key={`${record.kind}-${record.id}`}
              className="flex items-center justify-between px-3 py-2 rounded-xl gap-2 transition-all duration-200 hover:translate-y-[-1px]"
              style={{
                background: `rgba(${accentColor},0.05)`,
                border: `1px solid rgba(${accentColor},0.12)`,
                boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
              }}
            >
              {/* Left */}
              <div className="flex items-center gap-2 min-w-0">
                {record.logoUrl ? (
                  <img
                    src={record.logoUrl}
                    alt={record.chainName}
                    className="w-5 h-5 rounded-full shrink-0 object-cover"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black"
                    style={{
                      background: `rgba(${accentColor},0.15)`,
                      border: `1px solid rgba(${accentColor},0.2)`,
                      color: isPromo ? "#c084fc" : isBuy ? "#818cf8" : "#22c55e",
                    }}
                  >
                    {record.symbol.slice(0, 2)}
                  </div>
                )}

                {/* Type badge */}
                <span
                  className="flex items-center gap-0.5 text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: `rgba(${accentColor},0.12)`,
                    color: isPromo ? "#c084fc" : isBuy ? "#a5b4fc" : "#4ade80",
                    border: `1px solid rgba(${accentColor},0.2)`,
                  }}
                >
                  {isPromo
                    ? <><Gift className="w-2 h-2" /> PROMO</>
                    : isBuy
                    ? <><ShoppingCart className="w-2 h-2" /> BUY</>
                    : <><Droplets className="w-2 h-2" /> CLAIM</>
                  }
                </span>

                <span className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {record.chainName}
                </span>
                <span className="font-mono text-[10px] hidden sm:block shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {record.address.slice(0, 6)}…{record.address.slice(-4)}
                </span>
              </div>

              {/* Right */}
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className="font-mono text-xs font-bold"
                  style={{ color: isPromo ? "#c084fc" : isBuy ? "#a5b4fc" : "#4ade80" }}
                >
                  +{formatTokenAmount(record.amount)} {record.symbol}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {formatDistanceToNow(new Date(record.claimedAt), { addSuffix: true })}
                </span>
                {(() => {
                  const url = getExplorerUrl(record.chainName, record.txHash, record.explorerUrl);
                  return url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-[10px] font-mono transition-colors hover:opacity-80"
                      style={{ color: "rgba(255,255,255,0.3)" }}>
                      <ExternalLink className="w-2.5 h-2.5" /> TX
                    </a>
                  ) : null;
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
              {(safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, combined.length)} / {combined.length}
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSizeMenu(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                <SlidersHorizontal className="w-3 h-3" />
                {pageSize}
              </button>
              {showSizeMenu && (
                <div
                  className="absolute left-0 bottom-full mb-1.5 rounded-xl overflow-hidden z-20 min-w-[80px]"
                  style={{ background: "rgba(15,15,20,0.97)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
                >
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setPageSize(n); setPage(1); setShowSizeMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-mono transition-colors hover:bg-white/5"
                      style={{ color: pageSize === n ? "#4ade80" : "rgba(255,255,255,0.6)" }}
                    >
                      {n} / page
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => goTo(safeCurrentPage - 1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} />
            </button>

            {tabStart > 1 && (
              <>
                <button type="button" onClick={() => goTo(1)}
                  className="w-7 h-7 rounded-lg text-[11px] font-mono transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  1
                </button>
                {tabStart > 2 && <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>…</span>}
              </>
            )}

            {pageTabs.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                className="w-7 h-7 rounded-lg text-[11px] font-mono transition-all"
                style={{
                  background: p === safeCurrentPage ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                  border: p === safeCurrentPage ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: p === safeCurrentPage ? "#4ade80" : "rgba(255,255,255,0.5)",
                  fontWeight: p === safeCurrentPage ? 700 : 400,
                }}
              >
                {p}
              </button>
            ))}

            {tabEnd < totalPages && (
              <>
                {tabEnd < totalPages - 1 && <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>…</span>}
                <button type="button" onClick={() => goTo(totalPages)}
                  className="w-7 h-7 rounded-lg text-[11px] font-mono transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  {totalPages}
                </button>
              </>
            )}

            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => goTo(safeCurrentPage + 1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <ChevronRight className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
