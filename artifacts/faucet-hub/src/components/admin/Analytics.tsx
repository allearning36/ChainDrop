import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Loader2, TrendingUp, Users, Layers, Coins } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

interface DailyData { date: string; count: number; ethAmount: number; }
interface ChainData { chainId: number; name: string; symbol: string; count: number; ethAmount: number; }
interface AnalyticsSummary { totalClaims: number; totalEth: string; uniqueAddresses: number; today: number; }
interface AnalyticsResponse { dailyClaims: DailyData[]; chainDistribution: ChainData[]; summary: AnalyticsSummary; }

const COLORS = ["#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#4ade80", "#86efac", "#bbf7d0"];


function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-mono uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono text-primary">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1 font-mono">{sub}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-primary">{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/analytics")
      .then(r => r.json())
      .then((d: AnalyticsResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  if (!data || !data.summary) return <p className="text-muted-foreground text-center py-12">Failed to load analytics.</p>;

  const { summary, dailyClaims, chainDistribution } = data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold font-mono">Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">Claims data from the last 30 days.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Claims" value={summary.totalClaims.toLocaleString()} />
        <StatCard icon={Coins} label="Total ETH Out" value={`${summary.totalEth}`} sub="across all chains" />
        <StatCard icon={Users} label="Unique Wallets" value={summary.uniqueAddresses.toLocaleString()} />
        <StatCard icon={Layers} label="Today's Claims" value={summary.today} />
      </div>

      {/* Daily claims bar chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-mono font-semibold mb-4 text-muted-foreground uppercase tracking-widest">Daily Claims — Last 30 Days</h3>
        {dailyClaims.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8 font-mono">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyClaims} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Claims" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ETH distributed area chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-mono font-semibold mb-4 text-muted-foreground uppercase tracking-widest">ETH Distributed — Last 30 Days</h3>
        {dailyClaims.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8 font-mono">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyClaims} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ethGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ethAmount" name="ETH" stroke="#22c55e" fill="url(#ethGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chain distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-mono font-semibold mb-4 text-muted-foreground uppercase tracking-widest">Claims by Chain</h3>
          {chainDistribution.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8 font-mono">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={chainDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {chainDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} claims`]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-mono font-semibold mb-4 text-muted-foreground uppercase tracking-widest">Chain Breakdown</h3>
          <div className="space-y-3">
            {chainDistribution.length === 0
              ? <p className="text-muted-foreground text-sm font-mono">No data yet.</p>
              : chainDistribution.map((c, i) => {
                  const total = chainDistribution.reduce((acc, x) => acc + x.count, 0);
                  const pct = total ? Math.round((c.count / total) * 100) : 0;
                  return (
                    <div key={c.chainId}>
                      <div className="flex items-center justify-between text-sm font-mono mb-1">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          {c.name}
                        </span>
                        <span className="text-muted-foreground">{c.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}
