import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChainPublic } from "@workspace/api-client-react";
import { ExternalLink, X, Loader2 } from "lucide-react";

interface DexModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

export function DexModal({ chain, onClose }: DexModalProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!chain || !chain.buyUrl) return null;

  const displayPrice = chain.tokenPrice
    ? `$${parseFloat(chain.tokenPrice).toFixed(4)}`
    : null;

  return (
    <Dialog open={!!chain} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] flex flex-col bg-card border-border p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-mono uppercase tracking-tight text-lg">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {chain.logoUrl ? (
                  <img src={chain.logoUrl} alt={chain.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold">{chain.symbol.slice(0, 2)}</span>
                )}
              </div>
              Buy {chain.symbol}
              {displayPrice && (
                <span className="text-sm font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                  {displayPrice}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <a
                href={chain.buyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Swap powered by embedded DEX — {chain.name}
          </p>
        </DialogHeader>

        <div className="relative flex-1 min-h-[500px]">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-mono">Loading DEX...</p>
            </div>
          )}
          <iframe
            src={chain.buyUrl}
            title={`Buy ${chain.symbol}`}
            className="w-full h-full min-h-[500px] border-0"
            onLoad={() => setIframeLoaded(true)}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>

        <div className="px-6 py-3 border-t border-border flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-muted-foreground font-mono">
            Trading involves risk. Always verify contract addresses.
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} className="font-mono text-xs">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
