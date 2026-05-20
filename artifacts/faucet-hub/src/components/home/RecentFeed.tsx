import { useGetFaucetHistory, getGetFaucetHistoryQueryKey } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
      refetchInterval: 15000,
      queryKey: getGetFaucetHistoryQueryKey()
    }
  });

  if (history.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto my-12">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">Recent Drops</h2>
        <div className="h-[1px] flex-1 bg-border/50"></div>
      </div>
      
      <div className="grid gap-3">
        {history.slice(0, 8).map((record) => (
          <div 
            key={record.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-md border border-border/50 bg-card/30 gap-4 hover:bg-card/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/20">
                {record.chainName}
              </Badge>
              <div className="font-mono text-sm text-muted-foreground">
                {record.address.slice(0, 6)}...{record.address.slice(-4)}
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <div className="font-bold text-sm">
                +{record.amount} {record.symbol}
              </div>
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                <span>{formatDistanceToNow(new Date(record.claimedAt), { addSuffix: true })}</span>
                <a 
                  href={getExplorerUrl(record.chainName, record.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  TX
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
