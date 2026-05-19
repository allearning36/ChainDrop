import { ChainPublic, useGetChain, getGetChainQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Droplet, Wallet } from "lucide-react";

interface ChainCardProps {
  chain: ChainPublic;
  onClick: () => void;
}

export function ChainCard({ chain, onClick }: ChainCardProps) {
  // We can fetch live details if needed, but it might be heavy for the grid.
  // Instead, maybe only fetch on hover or modal open, or just rely on the list data unless we need live balance.
  // The spec says: "(from useGetChain per card, or show from list — keep it efficient)"
  // We'll just fetch live balance if the card is visible/rendered, but maybe with a long stale time.
  
  const { data: detail } = useGetChain(chain.id, {
    query: {
      enabled: !!chain.id,
      staleTime: 60000,
      queryKey: getGetChainQueryKey(chain.id),
    }
  });

  const displayChain = detail || chain;

  const statusColors = {
    YES: "bg-green-500/20 text-green-500 hover:bg-green-500/30",
    NO: "bg-red-500/20 text-red-500 hover:bg-red-500/30",
    SOON: "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30"
  };

  return (
    <Card 
      className="group cursor-pointer hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--primary),0.1)] bg-card/50 backdrop-blur"
      onClick={onClick}
    >
      <CardContent className="p-6 flex flex-col gap-4 h-full">
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

        <div className="mt-2 space-y-3 flex-1 flex flex-col justify-end">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> Reserve
            </span>
            <span className="font-mono">
              {'walletBalanceEth' in displayChain && displayChain.walletBalanceEth 
                ? `${parseFloat(String(displayChain.walletBalanceEth)).toFixed(4)} ${displayChain.symbol}`
                : '...'}
            </span>
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <div className="w-4 text-center">⚙</div> Available
            </span>
            <Badge variant="outline" className={`font-mono ${statusColors[displayChain.availableStatus as keyof typeof statusColors] || ""}`}>
              {displayChain.availableStatus}
            </Badge>
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Droplet className="w-4 h-4" /> Schedule
            </span>
            <span className="font-mono text-primary">
              {displayChain.cooldownHours}h
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
