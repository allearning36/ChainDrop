import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, ShieldCheck, Loader2, Trash2, RefreshCw, Globe, Fingerprint, Wallet } from "lucide-react";

interface AutoBan {
  id: number;
  targetType: string;
  targetValue: string;
  reason: string;
  trustScore: number | null;
  banCount: number | null;
  expiresAt: string;
  createdAt: string;
}

interface AbuseLog {
  id: number;
  address: string;
  ip: string;
  fingerprint: string | null;
  userAgent: string | null;
  timezone: string | null;
  country: string | null;
  isp: string | null;
  vpnDetected: boolean | null;
  proxyDetected: boolean | null;
  torDetected: boolean | null;
  datacenterDetected: boolean | null;
  trustScore: number | null;
  flags: string[] | null;
  action: string;
  chainId: number | null;
  createdAt: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function TrustBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 50 ? "bg-green-500/20 text-green-400" : score >= 25 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400";
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${color}`}>{score.toFixed(0)}</span>;
}

function ActionBadge({ action }: { action: string }) {
  if (action === "allowed") return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">ALLOWED</span>;
  if (action === "flagged") return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">FLAGGED</span>;
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">BLOCKED</span>;
}

function TargetIcon({ type }: { type: string }) {
  if (type === "ip")          return <Globe className="w-3.5 h-3.5 text-muted-foreground" />;
  if (type === "fingerprint") return <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Wallet className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function AntiAbusePanel() {
  const { toast } = useToast();
  const [bans, setBans]         = useState<AutoBan[]>([]);
  const [logs, setLogs]         = useState<AbuseLog[]>([]);
  const [suspicious, setSuspicious] = useState<AbuseLog[]>([]);
  const [loadingBans, setLoadingBans]     = useState(true);
  const [loadingLogs, setLoadingLogs]     = useState(true);
  const [liftingId, setLiftingId]         = useState<number | null>(null);

  async function fetchBans() {
    setLoadingBans(true);
    try {
      const res = await adminFetch("/api/anti-abuse/bans");
      if (res.ok) setBans(await res.json() as AutoBan[]);
    } finally { setLoadingBans(false); }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const [logRes, suspRes] = await Promise.all([
        adminFetch("/api/anti-abuse/logs"),
        adminFetch("/api/anti-abuse/suspicious"),
      ]);
      if (logRes.ok)  setLogs(await logRes.json() as AbuseLog[]);
      if (suspRes.ok) setSuspicious(await suspRes.json() as AbuseLog[]);
    } finally { setLoadingLogs(false); }
  }

  useEffect(() => { void fetchBans(); void fetchLogs(); }, []);

  async function liftBan(id: number) {
    setLiftingId(id);
    try {
      const res = await adminFetch(`/api/anti-abuse/bans/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBans(b => b.filter(x => x.id !== id));
        toast({ title: "Ban lifted", description: "The ban has been removed." });
      }
    } finally { setLiftingId(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" /> Anti-Abuse Monitor
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time tracking of suspicious activity, auto-bans, and trust scores.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Bans", value: bans.length, color: "text-red-400" },
          { label: "Suspicious (24h)", value: suspicious.length, color: "text-yellow-400" },
          { label: "Total Logs", value: logs.length, color: "text-blue-400" },
          { label: "Blocked", value: logs.filter(l => l.action === "blocked").length, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-border bg-card/40 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="bans">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="bans"    className="font-mono text-xs">Auto-Bans ({bans.length})</TabsTrigger>
          <TabsTrigger value="suspicious" className="font-mono text-xs">Suspicious ({suspicious.length})</TabsTrigger>
          <TabsTrigger value="logs"    className="font-mono text-xs">All Logs ({logs.length})</TabsTrigger>
        </TabsList>

        {/* ── Auto-Bans tab ── */}
        <TabsContent value="bans" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" variant="outline" onClick={fetchBans} disabled={loadingBans} className="font-mono text-xs">
              {loadingBans ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Refresh
            </Button>
          </div>
          {bans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground font-mono text-sm">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No active auto-bans
            </div>
          ) : (
            <div className="space-y-2">
              {bans.map(ban => (
                <div key={ban.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/40">
                  <TargetIcon type={ban.targetType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-foreground truncate max-w-[200px]">{ban.targetValue}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground uppercase">{ban.targetType}</span>
                      {ban.trustScore !== null && <TrustBadge score={ban.trustScore} />}
                      {ban.banCount !== null && ban.banCount > 1 && (
                        <span className="text-[10px] font-mono text-orange-400">#{ban.banCount} ban</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{ban.reason}</p>
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                      Expires: {formatTime(ban.expiresAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => liftBan(ban.id)}
                    disabled={liftingId === ban.id}
                    className="font-mono text-xs text-green-400 border-green-500/30 hover:bg-green-500/10 shrink-0"
                  >
                    {liftingId === ban.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Suspicious tab ── */}
        <TabsContent value="suspicious" className="mt-4">
          <LogTable logs={suspicious} loading={loadingLogs} onRefresh={fetchLogs} />
        </TabsContent>

        {/* ── All Logs tab ── */}
        <TabsContent value="logs" className="mt-4">
          <LogTable logs={logs} loading={loadingLogs} onRefresh={fetchLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogTable({ logs, loading, onRefresh }: { logs: AbuseLog[]; loading: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="font-mono text-xs">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Refresh
        </Button>
      </div>
      {logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground font-mono text-sm">No logs yet</div>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div key={log.id} className="rounded-lg border border-border bg-card/40 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-card/60 transition-colors"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-foreground truncate max-w-[140px]">{log.address}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{log.ip}</span>
                  {log.country && <span className="text-[10px] font-mono text-muted-foreground/60">{log.country}</span>}
                  {log.vpnDetected && <Badge variant="outline" className="text-[9px] px-1 py-0 border-yellow-500/40 text-yellow-400">VPN</Badge>}
                  {log.torDetected && <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-500/40 text-red-400">TOR</Badge>}
                  {log.proxyDetected && <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/40 text-orange-400">PROXY</Badge>}
                  {log.datacenterDetected && <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/40 text-blue-400">DC</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TrustBadge score={log.trustScore} />
                  <ActionBadge action={log.action} />
                  <span className="text-[10px] font-mono text-muted-foreground/50 hidden md:block">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </button>
              {expanded === log.id && (
                <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-1">
                  {log.userAgent && <p className="text-[10px] font-mono text-muted-foreground break-all">UA: {log.userAgent}</p>}
                  {log.timezone && <p className="text-[10px] font-mono text-muted-foreground">TZ: {log.timezone}</p>}
                  {log.fingerprint && <p className="text-[10px] font-mono text-muted-foreground">FP: {log.fingerprint.slice(0, 16)}...</p>}
                  {log.isp && <p className="text-[10px] font-mono text-muted-foreground">ISP: {log.isp}</p>}
                  {log.flags && log.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {log.flags.map((f, i) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground">{f}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] font-mono text-muted-foreground/50">{formatTime(log.createdAt)}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
