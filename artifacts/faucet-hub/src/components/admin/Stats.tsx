import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Droplet, Network, Repeat2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsOverview() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: { 
      refetchInterval: 30000,
      queryKey: getGetAdminStatsQueryKey()
    }
  });

  const cards = [
    {
      title: "Total Claims",
      value: stats?.totalClaims,
      icon: Droplet,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20"
    },
    {
      title: "Active Chains",
      value: stats?.activeChains,
      icon: Activity,
      color: "text-green-500",
      bg: "bg-green-500/10",
      border: "border-green-500/20"
    },
    {
      title: "Total Chains",
      value: stats?.totalChains,
      icon: Network,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20"
    },
    {
      title: "Recent Claims (24h)",
      value: stats?.recentClaimsCount,
      icon: Repeat2,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">System Status</h2>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Card key={i} className={`bg-card ${card.border}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
                {card.title}
              </CardTitle>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.bg} ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold font-mono">{card.value !== undefined ? card.value.toLocaleString() : "0"}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
