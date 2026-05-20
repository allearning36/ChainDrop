import { useState } from "react";
import { ChainPublic, useGetChain, getGetChainQueryKey } from "@workspace/api-client-react";
import { Droplet, Wallet, Zap, Clock } from "lucide-react";
import { formatCooldown } from "@/lib/utils";

interface ChainCardProps {
  chain: ChainPublic;
  onClick: () => void;
}

export function ChainCard({ chain, onClick }: ChainCardProps) {
  const [soonPopover, setSoonPopover] = useState(false);

  const { data: detail } = useGetChain(chain.id, {
    query: {
      enabled: !!chain.id,
      staleTime: 60000,
      queryKey: getGetChainQueryKey(chain.id),
    }
  });

  const displayChain = detail || chain;
  const isSoon = displayChain.availableStatus === "SOON";
  const isYes  = displayChain.availableStatus === "YES";

  const soonMsg: string =
    ("soonMessage" in displayChain && typeof (displayChain as any).soonMessage === "string" && (displayChain as any).soonMessage.trim())
      ? (displayChain as any).soonMessage
      : "This faucet will be live very soon. Stay tuned!";

  return (
    <div
      className="chain-card group relative flex flex-col overflow-hidden transition-all duration-300"
      style={{
        background: "linear-gradient(145deg, rgba(14,17,22,0.95) 0%, rgba(10,13,18,0.98) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "16px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Hover glow overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[16px]"
        style={{
          background: isYes
            ? "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.07) 0%, transparent 70%)"
            : isSoon
            ? "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 70%)"
            : "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(239,68,68,0.05) 0%, transparent 70%)",
        }}
      />
      {/* Hover border glow */}
      <div
        className="absolute -inset-[1px] rounded-[16px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10"
        style={{
          background: isYes
            ? "linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(6,182,212,0.15) 100%)"
            : isSoon
            ? "linear-gradient(135deg, rgba(245,158,11,0.3) 0%, rgba(251,191,36,0.1) 100%)"
            : "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, transparent 100%)",
          filter: "blur(0.5px)",
        }}
      />

      <div className="relative p-5 flex flex-col gap-4 flex-1">
        {/* Chain header */}
        <div className="flex items-center gap-3.5">
          {/* Logo with ring */}
          <div
            className="relative w-12 h-12 rounded-full shrink-0 overflow-hidden transition-all duration-300 group-hover:scale-105"
            style={{
              background: "rgba(255,255,255,0.05)",
              boxShadow: isYes
                ? "0 0 0 1px rgba(34,197,94,0.25), 0 0 12px rgba(34,197,94,0.15)"
                : "0 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            {displayChain.logoUrl ? (
              <img src={displayChain.logoUrl} alt={displayChain.name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-black text-base"
                style={{
                  background: "linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(6,182,212,0.1) 100%)",
                  color: "rgba(34,197,94,0.9)",
                }}
              >
                {displayChain.symbol.slice(0, 2)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight truncate text-white/90">{displayChain.name}</h3>
            <p
              className="text-xs font-mono mt-0.5 font-semibold"
              style={{ color: "rgba(34,197,94,0.7)", letterSpacing: "0.06em" }}
            >
              {displayChain.symbol}
            </p>
          </div>

          {/* Status dot */}
          <div className="ml-auto shrink-0">
            {isYes ? (
              <span className="flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full opacity-60" style={{ background: "rgba(34,197,94,0.6)" }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#22c55e" }} />
              </span>
            ) : isSoon ? (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#f59e0b" }} />
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#ef4444" }} />
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 50%, transparent)" }} />

        {/* Stats */}
        <div className="space-y-2.5 flex-1">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Wallet className="w-3.5 h-3.5" /> Reserve
            </span>
            <span className="font-mono text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              {"walletBalanceEth" in displayChain && displayChain.walletBalanceEth
                ? `${parseFloat(String(displayChain.walletBalanceEth)).toFixed(4)} ${displayChain.symbol}`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Zap className="w-3.5 h-3.5" /> Drop
            </span>
            <span
              className="font-mono text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #4ade80, #22c55e)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {displayChain.claimAmount} {displayChain.symbol}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Clock className="w-3.5 h-3.5" /> Cooldown
            </span>
            <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              {formatCooldown(displayChain.cooldownSeconds)}
            </span>
          </div>
        </div>

        {/* Action button */}
        <div className="pt-1">
          {isYes ? (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="chain-claim-btn w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase transition-all duration-200 active:scale-95 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #15803d 0%, #22c55e 60%, #4ade80 100%)",
                color: "#fff",
                boxShadow: "0 0 20px rgba(34,197,94,0.4), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                letterSpacing: "0.15em",
              }}
            >
              <span className="relative z-10">CLAIM</span>
              {/* Shimmer effect */}
              <span className="chain-claim-shimmer absolute inset-0 pointer-events-none" />
            </button>
          ) : isSoon ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSoonPopover(p => !p); }}
                className="w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase transition-all duration-200 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #92400e 0%, #d97706 60%, #fbbf24 100%)",
                  color: "#fff",
                  boxShadow: "0 0 16px rgba(245,158,11,0.3), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                  letterSpacing: "0.15em",
                }}
              >
                SOON
              </button>
              {soonPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSoonPopover(false)} />
                  <div
                    className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl p-4 text-sm font-mono shadow-2xl"
                    style={{
                      background: "rgba(20,16,8,0.97)",
                      border: "1px solid rgba(245,158,11,0.35)",
                      boxShadow: "0 0 32px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.5)",
                      color: "#fbbf24",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">⏳</span>
                      <p className="leading-relaxed text-xs">{soonMsg}</p>
                    </div>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45"
                      style={{ background: "rgba(20,16,8,0.97)", border: "1px solid rgba(245,158,11,0.35)", borderTop: "none", borderLeft: "none" }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase text-center"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "rgba(239,68,68,0.6)",
                border: "1px solid rgba(239,68,68,0.15)",
                letterSpacing: "0.15em",
              }}
            >
              UNAVAILABLE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
