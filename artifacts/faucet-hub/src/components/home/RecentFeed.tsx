import { useGetFaucetHistory, getGetFaucetHistoryQueryKey } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, ShoppingCart, Droplets } from "lucide-react";

function getExplorerUrl(chainName: string, txHash: string): string {
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
  return `https://blockscan.com/tx/${txHash}`;
}

export function RecentFeed() {
  const { data: history = [] } = useGetFaucetHistory({
    query: {
      refetchInterval: 10000,
      queryKey: getGetFaucetHistoryQueryKey(),
    }
  });

  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto my-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
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

      <div className="flex flex-col gap-2">
        {history.slice(0, 15).map((record) => {
          const isBuy = record.type === "buy";
          return (
            <div
              key={`${record.type}-${record.id}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 rounded-2xl gap-3 transition-all duration-200 hover:translate-y-[-1px]"
              style={{
                background: isBuy
                  ? "rgba(129,140,248,0.05)"
                  : "rgba(34,197,94,0.04)",
                border: isBuy
                  ? "1px solid rgba(129,140,248,0.12)"
                  : "1px solid rgba(34,197,94,0.1)",
                boxShadow: "0 1px 8px rgba(0,0,0,0.2)",
              }}
            >
              {/* Left: type badge + chain + address */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Chain logo */}
                {record.logoUrl ? (
                  <img
                    src={record.logoUrl}
                    alt={record.chainName}
                    className="w-7 h-7 rounded-full shrink-0 object-cover"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black"
                    style={{
                      background: isBuy ? "rgba(129,140,248,0.15)" : "rgba(34,197,94,0.12)",
                      border: isBuy ? "1px solid rgba(129,140,248,0.2)" : "1px solid rgba(34,197,94,0.2)",
                      color: isBuy ? "#818cf8" : "#22c55e",
                    }}
                  >
                    {record.symbol.slice(0, 2)}
                  </div>
                )}

                {/* Type + chain badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                    style={isBuy
                      ? { background: "rgba(129,140,248,0.12)", color: "#a5b4fc", border: "1px solid rgba(129,140,248,0.2)" }
                      : { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                    }
                  >
                    {isBuy
                      ? <><ShoppingCart className="w-2.5 h-2.5" /> BUY</>
                      : <><Droplets className="w-2.5 h-2.5" /> CLAIM</>
                    }
                  </span>
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {record.chainName}
                  </span>
                </div>

                {/* Address */}
                <span className="font-mono text-xs hidden sm:block" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {record.address.slice(0, 6)}…{record.address.slice(-4)}
                </span>
              </div>

              {/* Right: amount + time + TX link */}
              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <span
                  className="font-mono text-sm font-bold"
                  style={{
                    color: isBuy ? "#a5b4fc" : "#4ade80",
                  }}
                >
                  +{parseFloat(record.amount).toFixed(4)} {record.symbol}
                </span>

                <span className="text-[11px] font-mono hidden sm:block" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {formatDistanceToNow(new Date(record.claimedAt), { addSuffix: true })}
                </span>

                <a
                  href={getExplorerUrl(record.chainName, record.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-mono transition-colors hover:opacity-80"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  <ExternalLink className="w-3 h-3" />
                  TX
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
