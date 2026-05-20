import { useState } from "react";
import { ChainPublic, useGetChain, getGetChainQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="bg-card/50 backdrop-blur border border-border/60 transition-all duration-300 hover:border-border hover:shadow-[0_0_18px_rgba(34,197,94,0.07)] flex flex-col">
      <CardContent className="p-6 flex flex-col gap-4 flex-1">

        {/* Chain header — NOT clickable */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
            {displayChain.logoUrl ? (
              <img src={displayChain.logoUrl} alt={displayChain.name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-lg">{displayChain.symbol.slice(0, 2)}</span>
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">{displayChain.name}</h3>
            <p className="text-sm text-muted-foreground font-mono">{displayChain.symbol}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2.5 flex-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Reserve
            </span>
            <span className="font-mono text-xs">
              {"walletBalanceEth" in displayChain && displayChain.walletBalanceEth
                ? `${parseFloat(String(displayChain.walletBalanceEth)).toFixed(4)} ${displayChain.symbol}`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Drop
            </span>
            <span className="font-mono text-xs text-primary font-semibold">
              {displayChain.claimAmount} {displayChain.symbol}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Cooldown
            </span>
            <span className="font-mono text-xs">{formatCooldown(displayChain.cooldownSeconds)}</span>
          </div>
        </div>

        {/* Action button */}
        <div className="pt-2 border-t border-border/40 relative">
          {isYes ? (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-full py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all duration-200 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
                color: "#fff",
                boxShadow: "0 0 12px rgba(34,197,94,0.35)",
              }}
            >
              CLAIM
            </button>
          ) : isSoon ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSoonPopover(p => !p); }}
                className="w-full py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all duration-200 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)",
                  color: "#fff",
                  boxShadow: "0 0 12px rgba(245,158,11,0.3)",
                }}
              >
                SOON
              </button>

              {/* SOON popover */}
              {soonPopover && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSoonPopover(false)}
                  />
                  <div
                    className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl p-4 text-sm font-mono shadow-2xl"
                    style={{
                      background: "#1a1a1a",
                      border: "1px solid rgba(245,158,11,0.35)",
                      boxShadow: "0 0 24px rgba(245,158,11,0.15)",
                      color: "#fbbf24",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">⏳</span>
                      <p className="leading-relaxed">{soonMsg}</p>
                    </div>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45"
                      style={{ background: "#1a1a1a", border: "1px solid rgba(245,158,11,0.35)", borderTop: "none", borderLeft: "none" }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="w-full py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider text-center"
              style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              UNAVAILABLE
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
