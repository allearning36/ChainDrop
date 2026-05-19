import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChainPublic } from "@workspace/api-client-react";
import { ExternalLink, X, Loader2, ArrowLeftRight, ShoppingCart } from "lucide-react";

interface DexModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

export function DexModal({ chain, onClose }: DexModalProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!chain || !chain.buyUrl) return null;

  const isTestnet = chain.isTestnet;

  const title = isTestnet
    ? `Bridge ETH → ${chain.symbol}`
    : `Buy ${chain.symbol}`;

  const subtitle = isTestnet
    ? `Bridge real ETH to get ${chain.name} tokens — powered by testnetbridge.com`
    : `Swap or buy ${chain.symbol} on ${chain.name}`;

  const loadingText = isTestnet ? "Loading Bridge..." : "Loading DEX...";
  const footerText = isTestnet
    ? "Bridge funds from Ethereum mainnet to get testnet tokens."
    : "Trading involves risk. Always verify contract addresses.";

  const displayPrice = !isTestnet && chain.tokenPrice
    ? `$${parseFloat(chain.tokenPrice).toFixed(4)}`
    : null;

  return (
    <Dialog open={!!chain} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0" style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)" }}>
        <DialogHeader className="px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-mono uppercase tracking-tight text-base" style={{ color: "#e2e8f0" }}>
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {chain.logoUrl ? (
                  <img src={chain.logoUrl} alt={chain.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold">{chain.symbol.slice(0, 2)}</span>
                )}
              </div>

              {isTestnet ? (
                <ArrowLeftRight className="w-4 h-4" style={{ color: "#818cf8" }} />
              ) : (
                <ShoppingCart className="w-4 h-4" style={{ color: "#22c55e" }} />
              )}

              <span style={{ color: isTestnet ? "#818cf8" : "#22c55e" }}>{title}</span>

              {displayPrice && (
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
                  {displayPrice}
                </span>
              )}

              {isTestnet && (
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", color: "#818cf8" }}>
                  TESTNET
                </span>
              )}
            </DialogTitle>

            <div className="flex items-center gap-2">
              <a
                href={chain.buyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors"
                style={{ color: "rgba(255,255,255,0.4)" }}
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 hover:opacity-80" />
              </a>
              <button
                onClick={onClose}
                className="transition-colors ml-1"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <X className="w-4 h-4 hover:opacity-80" />
              </button>
            </div>
          </div>

          <p className="text-xs font-mono mt-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {subtitle}
          </p>
        </DialogHeader>

        <div className="relative flex-1 min-h-[520px]">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ background: "#0d0d14" }}>
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: isTestnet ? "#818cf8" : "#22c55e" }} />
              <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{loadingText}</p>
            </div>
          )}
          <iframe
            src={chain.buyUrl}
            title={title}
            className="w-full h-full min-h-[520px] border-0"
            onLoad={() => setIframeLoaded(true)}
            allow="clipboard-write; web-share"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>

        <div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
            {footerText}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="font-mono text-xs"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
