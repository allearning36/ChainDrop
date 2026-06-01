import { useGetPrices, getGetPricesQueryKey } from "@workspace/api-client-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from "react";

export function PriceMarquee({ coinIds }: { coinIds: string[] }) {
  const idsString = useMemo(() => {
    return [...new Set(coinIds.filter(Boolean))].join(",");
  }, [coinIds]);

  const { data: prices } = useGetPrices(
    { ids: idsString },
    { 
      query: {
        enabled: idsString.length > 0,
        refetchInterval: 120_000,
        staleTime: 60_000,
        queryKey: getGetPricesQueryKey({ ids: idsString })
      } 
    }
  );

  if (!prices || prices.length === 0) return null;

  // Duplicate for seamless loop
  const displayPrices = [...prices, ...prices, ...prices];

  return (
    <div className="marquee-container py-2 text-sm font-mono">
      <div className="marquee-content gap-8">
        {displayPrices.map((item, index) => {
          const isPositive = (item.price_change_percentage_24h || 0) >= 0;
          return (
            <div key={`${item.id}-${index}`} className="flex items-center gap-2 min-w-max">
              <span className="font-bold text-muted-foreground">{item.symbol.toUpperCase()}</span>
              <span>${item.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              <span className={`flex items-center text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(item.price_change_percentage_24h || 0).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
