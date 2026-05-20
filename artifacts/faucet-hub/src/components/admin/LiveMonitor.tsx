import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, Wifi, WifiOff, Trash2,
  Activity, AlertTriangle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id: string;
  type: "claim_success" | "claim_error" | "rpc_error" | "server_error" | "ping" | "connected";
  ts: string;
  chainName?: string;
  chainId?: number;
  address?: string;
  txHash?: string;
  amount?: string;
  symbol?: string;
  ip?: string;
  error?: string;
  rootCause?: string;
  detail?: string;
  clients?: number;
}

const ROOT_CAUSE_FIX: Record<string, string> = {
  RPC_TIMEOUT: "Admin panel → Chains → Edit chain → সঠিক/দ্রুত RPC URL দাও",
  RPC_UNREACHABLE: "Admin panel → Chains → Edit chain → RPC URL যাচাই করো",
  WALLET_EMPTY: "Faucet wallet-এ token পাঠাও",
  NONCE_CONFLICT: "কিছুক্ষণ পর আবার try করো",
  GAS_ESTIMATION_FAILED: "RPC URL বা wallet balance চেক করো",
  BAD_PRIVATE_KEY: "Admin panel → Chains → সঠিক Private Key দাও",
  CAPTCHA_FAILED: "User reCAPTCHA সঠিকভাবে complete করেনি",
  RATE_LIMITED: "IP rate limit hit — স্বাভাবিক",
  ADDRESS_BLOCKED: "Admin কর্তৃক blocked",
  COOLDOWN_ACTIVE: "Cooldown এখনো শেষ হয়নি",
  UNKNOWN: "Server log দেখো বিস্তারিত জানতে",
};

function maskAddress(addr?: string) {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function maskIp(ip?: string) {
  if (!ip) return "";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.x.x.${parts[3]}`;
  return ip.slice(0, 8) + "…";
}

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function LiveMonitor() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const successCount = events.filter((e) => e.type === "claim_success").length;
  const errorCount = events.filter((e) => e.type === "claim_error" || e.type === "rpc_error" || e.type === "server_error").length;

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      const token = getToken();
      if (!token) return;

      // Step 1: get a short-lived SSE ticket (avoids JWT in URL)
      let ticket: string;
      try {
        const r = await fetch("/api/admin/live-ticket", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) { setTimeout(connect, 5000); return; }
        const data = await r.json() as { ticket: string };
        ticket = data.ticket;
      } catch { setTimeout(connect, 5000); return; }

      if (cancelled) return;

      // Step 2: open SSE with the ticket
      const es = new EventSource(`/api/admin/live?ticket=${encodeURIComponent(ticket)}`);
      esRef.current = es;

      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!cancelled) setTimeout(connect, 3000);
      };

      es.onmessage = (e: MessageEvent) => {
        if (pausedRef.current) return;
        try {
          const event = JSON.parse(e.data as string) as LiveEvent;
          if (event.type === "ping") return;
          setEvents((prev) => [event, ...prev].slice(0, 200));
        } catch { /* ignore */ }
      };
    }

    void connect();
    return () => { cancelled = true; esRef.current?.close(); };
  }, []);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full",
              connected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)] animate-pulse" : "bg-red-500"
            )} />
            <span className={cn("text-sm font-mono font-semibold", connected ? "text-green-400" : "text-red-400")}>
              {connected ? "LIVE" : "DISCONNECTED"}
            </span>
          </div>
          {connected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-400 border-green-400/30 font-mono text-xs gap-1">
            <CheckCircle2 className="w-3 h-3" /> {successCount} success
          </Badge>
          <Badge variant="outline" className="text-red-400 border-red-400/30 font-mono text-xs gap-1">
            <XCircle className="w-3 h-3" /> {errorCount} error
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={togglePause} className="font-mono text-xs h-7 px-2">
            {paused ? <><Activity className="w-3 h-3 mr-1" />Resume</> : <><Zap className="w-3 h-3 mr-1" />Pause</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEvents([])} className="font-mono text-xs h-7 px-2 text-muted-foreground">
            <Trash2 className="w-3 h-3 mr-1" />Clear
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Live Event Feed</span>
          {paused && <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 text-[10px] font-mono ml-auto">PAUSED</Badge>}
        </div>

        <ScrollArea className="h-[520px]">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Activity className="w-8 h-8 opacity-30" />
              <p className="text-sm font-mono">{connected ? "Waiting for activity…" : "Connecting…"}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Error legend */}
      {errorCount > 0 && (
        <div className="border border-red-500/20 rounded-lg bg-red-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-semibold uppercase tracking-widest">
            <AlertTriangle className="w-3.5 h-3.5" /> Error Guide
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {[...new Set(events.filter(e => e.rootCause).map(e => e.rootCause!))].map((cause) => (
              <div key={cause} className="text-xs space-y-0.5">
                <div className="font-mono text-red-400 font-semibold">{cause}</div>
                <div className="text-muted-foreground">{ROOT_CAUSE_FIX[cause] ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event: ev }: { event: LiveEvent }) {
  const isSuccess = ev.type === "claim_success";
  const isError = ev.type === "claim_error" || ev.type === "rpc_error" || ev.type === "server_error";
  const isConnected = ev.type === "connected";

  return (
    <div className={cn(
      "px-4 py-3 flex flex-col gap-1.5 text-xs font-mono transition-colors",
      isSuccess && "bg-green-500/5 hover:bg-green-500/10",
      isError && "bg-red-500/5 hover:bg-red-500/10",
      isConnected && "bg-primary/5",
      !isSuccess && !isError && !isConnected && "hover:bg-muted/30",
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {isError && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {isConnected && <Wifi className="w-3.5 h-3.5 text-primary shrink-0" />}
        {!isSuccess && !isError && !isConnected && <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}

        <span className={cn(
          "font-semibold uppercase tracking-wide",
          isSuccess && "text-green-400",
          isError && "text-red-400",
          isConnected && "text-primary",
          !isSuccess && !isError && !isConnected && "text-muted-foreground",
        )}>
          {ev.type.replace(/_/g, " ")}
        </span>

        {ev.chainName && (
          <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-primary/30 text-primary">
            {ev.chainName}
          </Badge>
        )}

        <span className="ml-auto text-muted-foreground text-[10px]">{timeAgo(ev.ts)}</span>
      </div>

      {isSuccess && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
          <span>addr: <span className="text-foreground">{maskAddress(ev.address)}</span></span>
          <span>amount: <span className="text-green-400 font-semibold">{ev.amount} {ev.symbol}</span></span>
          {ev.txHash && <span>tx: <span className="text-foreground">{ev.txHash.slice(0, 12)}…</span></span>}
          {ev.ip && <span>ip: <span className="text-foreground">{maskIp(ev.ip)}</span></span>}
        </div>
      )}

      {isError && (
        <div className="pl-5 space-y-1">
          {ev.rootCause && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-red-400 font-semibold">{ev.rootCause}</span>
              <span className="text-muted-foreground">—</span>
              <span className="text-foreground">{ev.detail}</span>
            </div>
          )}
          {ev.address && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>addr: <span className="text-foreground">{maskAddress(ev.address)}</span></span>
              {ev.ip && <span>ip: <span className="text-foreground">{maskIp(ev.ip)}</span></span>}
            </div>
          )}
          {ev.error && (
            <div className="text-[10px] text-red-300/60 bg-red-500/10 rounded px-2 py-1 border border-red-500/10 break-all">
              {ev.error}
            </div>
          )}
          {ev.rootCause && ROOT_CAUSE_FIX[ev.rootCause] && (
            <div className="text-[11px] text-yellow-400/80 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              Fix: {ROOT_CAUSE_FIX[ev.rootCause]}
            </div>
          )}
        </div>
      )}

      {isConnected && (
        <div className="pl-5 text-[11px] text-muted-foreground">
          SSE connection established · {ev.clients ?? 1} admin connected
        </div>
      )}
    </div>
  );
}
