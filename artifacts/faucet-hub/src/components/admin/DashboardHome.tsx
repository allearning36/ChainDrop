import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Loader2, TrendingUp, Users, Layers, Coins, Activity, Link as LinkIcon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface DailyData    { date: string; count: number; ethAmount: number; }
interface ChainData    { chainId: number; name: string; symbol: string; count: number; ethAmount: number; }
interface AnalyticsSummary { totalClaims: number; totalEth: string; uniqueAddresses: number; today: number; }
interface AnalyticsResp { dailyClaims: DailyData[]; chainDistribution: ChainData[]; summary: AnalyticsSummary; }

const COLORS = ["#22c55e", "#16a34a", "#4ade80", "#a78bfa", "#60a5fa", "#f59e0b", "#f87171", "#34d399"];

function StatCard({
  icon: Icon, label, value, sub, color = "#22c55e",
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
        {sub && <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-primary">{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
}

export function DashboardHome() {
  const [analytics, setAnalytics] = useState<AnalyticsResp | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 30000, queryKey: getGetAdminStatsQueryKey() }
  });

  useEffect(() => {
    adminFetch("/api/admin/analytics")
      .then(r => r.json())
      .then((d: AnalyticsResp) => setAnalytics(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const summary = analytics?.summary;
  const dailyClaims = analytics?.dailyClaims ?? [];
  const chainDist = analytics?.chainDistribution ?? [];

  // Last 14 days for compact chart
  const chartData = dailyClaims.slice(-14);

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold font-mono tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground font-mono mt-0.5">System overview &amp; recent activity</p>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl p-5 h-24 animate-pulse" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={TrendingUp}
            label="Total Claims"
            value={(summary?.totalClaims ?? stats?.totalClaims ?? 0).toLocaleString()}
            sub="all time"
            color="#22c55e"
          />
          <StatCard
            icon={Coins}
            label="Tokens Distributed"
            value={summary ? summary.totalEth : "—"}
            sub="native tokens (mixed)"
            color="#4ade80"
          />
          <StatCard
            icon={LinkIcon}
            label="Active Chains"
            value={stats?.activeChains ?? "—"}
            sub={`of ${stats?.totalChains ?? "?"} total`}
            color="#60a5fa"
          />
          <StatCard
            icon={Activity}
            label="Claims Today"
            value={summary?.today ?? stats?.recentClaimsCount ?? 0}
            sub="last 24 hours"
            color="#a78bfa"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-4">

        {/* Area chart — Claims last 14 days */}
        <div
          className="md:col-span-2 rounded-xl p-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-mono font-semibold">Claims Overview</p>
              <p className="text-[11px] text-muted-foreground font-mono">Last 14 days</p>
            </div>
            {!loading && summary && (
              <div className="text-right">
                <p className="text-xs font-mono text-muted-foreground">Unique Wallets</p>
                <p className="font-mono font-bold text-sm text-primary">{summary.uniqueAddresses.toLocaleString()}</p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-44 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-44 flex items-center justify-center">
              <p className="text-muted-foreground text-sm font-mono">No data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="claimGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.35)" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.35)" }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Claims"
                  stroke="#22c55e"
                  fill="url(#claimGrad)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#22c55e" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Chains donut */}
        <div
          className="rounded-xl p-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-sm font-mono font-semibold mb-1">Top Chains</p>
          <p className="text-[11px] text-muted-foreground font-mono mb-4">By claim volume</p>

          {loading ? (
            <div className="h-36 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : chainDist.length === 0 ? (
            <div className="h-36 flex items-center justify-center">
              <p className="text-muted-foreground text-xs font-mono">No data</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={chainDist.slice(0, 6)}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={52}
                    strokeWidth={0}
                  >
                    {chainDist.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`${v} claims`]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {chainDist.slice(0, 5).map((c, i) => {
                  const total = chainDist.reduce((s, x) => s + x.count, 0);
                  const pct = total ? Math.round((c.count / total) * 100) : 0;
                  return (
                    <div key={c.chainId} className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="text-foreground/70 ml-2">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Unique wallets + quick stats */}
      {!loading && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Unique Wallets"
            value={summary.uniqueAddresses.toLocaleString()}
            color="#f59e0b"
          />
          <StatCard
            icon={Layers}
            label="Chain Count"
            value={chainDist.length}
            sub="with activity"
            color="#f87171"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg ETH / Claim"
            value={summary.totalClaims > 0
              ? `${(parseFloat(summary.totalEth) / summary.totalClaims).toFixed(4)}`
              : "—"}
            sub="ETH per claim"
            color="#34d399"
          />
          <StatCard
            icon={Activity}
            label="Claim Frequency"
            value={chartData.length > 0
              ? `${Math.round(chartData.reduce((s, d) => s + d.count, 0) / chartData.length)}/day`
              : "—"}
            sub="14-day average"
            color="#818cf8"
          />
        </div>
      )}

      {/* Recent chain activity */}
      {!loading && chainDist.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-sm font-mono font-semibold mb-4">Chain Activity Breakdown</p>
          <div className="space-y-3">
            {chainDist.map((c, i) => {
              const total = chainDist.reduce((s, x) => s + x.count, 0);
              const pct = total ? (c.count / total) * 100 : 0;
              return (
                <div key={c.chainId}>
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-muted-foreground">{c.symbol}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{c.count.toLocaleString()} claims</span>
                      <span>{parseFloat(c.ethAmount.toString()).toFixed(4)} ETH</span>
                      <span className="text-foreground font-semibold w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
