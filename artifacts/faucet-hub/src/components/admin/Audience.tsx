import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Users, Globe, Monitor, Smartphone, Tablet,
  TrendingUp, Calendar, Clock, MapPin, FileText,
} from "lucide-react";

interface AudienceStats {
  summary: {
    allTime: number; today: number; weekly: number; monthly: number;
    newToday: number; returning: number;
  };
  dailyChart: { date: string; unique: number; total: number }[];
  topCountries: { country: string; countryCode: string; unique: number; pct: number }[];
  devices: { desktop: number; mobile: number; tablet: number };
  topPages: { path: string; views: number; unique: number }[];
  recentVisits: { ip: string; country: string; countryCode: string; path: string; deviceType: string; visitedAt: string }[];
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E0 - 65 + c.charCodeAt(0))
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const DEVICE_COLORS: Record<string, string> = {
  desktop: "#6366f1",
  mobile:  "#22d3ee",
  tablet:  "#f59e0b",
};

const DeviceIcon = ({ type }: { type: string }) => {
  if (type === "mobile")  return <Smartphone className="w-3 h-3" />;
  if (type === "tablet")  return <Tablet className="w-3 h-3" />;
  return <Monitor className="w-3 h-3" />;
};

export function Audience() {
  const [data, setData] = useState<AudienceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/audience")
      .then(r => r.ok ? r.json() : Promise.reject("Failed to load"))
      .then((d: AudienceStats) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center text-destructive py-16">{error ?? "No data"}</div>
  );

  const { summary, dailyChart, topCountries, devices, topPages, recentVisits } = data;
  const totalDevices = devices.desktop + devices.mobile + devices.tablet || 1;
  const deviceData = [
    { name: "Desktop", value: devices.desktop, key: "desktop" },
    { name: "Mobile",  value: devices.mobile,  key: "mobile"  },
    { name: "Tablet",  value: devices.tablet,  key: "tablet"  },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "All-Time",    value: summary.allTime,  icon: Users,    color: "text-primary" },
          { label: "This Month",  value: summary.monthly,  icon: Calendar, color: "text-emerald-400" },
          { label: "This Week",   value: summary.weekly,   icon: TrendingUp, color: "text-cyan-400" },
          { label: "Today",       value: summary.today,    icon: Clock,    color: "text-yellow-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className={`text-3xl font-bold font-mono ${color}`}>{fmt(value)}</div>
              <div className="text-xs text-muted-foreground mt-1">Unique visitors</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New vs Returning */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase">New Today</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">{fmt(summary.newToday)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase">Returning</div>
              <div className="text-2xl font-bold font-mono text-primary">{fmt(summary.returning)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Daily Visitors Chart ────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
            Daily Unique Visitors — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickFormatter={d => d.slice(5)}
                  interval={Math.floor(dailyChart.length / 7)}
                />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                  formatter={(v, n) => [v, n === "unique" ? "Unique visitors" : "Total visits"]}
                />
                <Area type="monotone" dataKey="unique" stroke="#6366f1" strokeWidth={2}
                  fill="url(#colorUnique)" dot={false} name="unique" />
                <Area type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={1.5}
                  fill="none" strokeDasharray="4 2" dot={false} name="total" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Countries + Devices ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Countries */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Top Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCountries.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">No country data yet</div>
            ) : (
              <div className="space-y-2">
                {topCountries.map((c, i) => (
                  <div key={c.countryCode} className="flex items-center gap-3">
                    <span className="text-base w-6 text-center">{flagEmoji(c.countryCode)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate">{c.country}</span>
                        <span className="text-xs font-mono text-muted-foreground ml-2 shrink-0">
                          {fmt(c.unique)} ({c.pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.pct}%`,
                            background: `hsl(${240 - i * 20}, 70%, 60%)`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-5 text-right">#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Devices */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Device Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deviceData.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">No data yet</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={deviceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#888" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {deviceData.map(d => (
                        <Cell key={d.key} fill={DEVICE_COLORS[d.key] ?? "#6366f1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {deviceData.map(d => (
                    <div key={d.key} className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <DeviceIcon type={d.key} />
                        <span className="text-xs">{d.name}</span>
                      </div>
                      <div className="font-mono font-bold text-lg" style={{ color: DEVICE_COLORS[d.key] }}>
                        {Math.round((d.value / totalDevices) * 100)}%
                      </div>
                      <div className="text-xs text-muted-foreground">{fmt(d.value)} visits</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Pages + Recent Visits ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Top Pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">No page data yet</div>
            ) : (
              <div className="space-y-2">
                {topPages.map((p, i) => (
                  <div key={p.path} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground font-mono w-4">#{i + 1}</span>
                    <span className="flex-1 font-mono text-xs truncate text-foreground">{p.path || "/"}</span>
                    <div className="flex gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">{fmt(p.unique)} uniq</span>
                      <span className="text-xs font-mono font-medium text-primary">{fmt(p.views)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Visits */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4" /> Recent Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentVisits.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">No visits yet</div>
            ) : (
              <div className="space-y-2">
                {recentVisits.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                    <span className="text-base shrink-0">{flagEmoji(v.countryCode)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{v.ip}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono shrink-0">
                          {v.country}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">{v.path || "/"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DeviceIcon type={v.deviceType} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{timeAgo(v.visitedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
