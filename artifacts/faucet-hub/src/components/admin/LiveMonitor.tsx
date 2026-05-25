import { useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, Wifi, WifiOff, Trash2,
  Activity, AlertTriangle, Zap, ShoppingCart, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveEvent {
  id: string;
  type: "claim_success" | "claim_error" | "rpc_error" | "server_error" | "buy_success" | "buy_error" | "swap_success" | "swap_error" | "ping" | "connected";
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
  hint?: string;
  clients?: number;
  historical?: boolean;
  fromChainName?: string;
  toChainName?: string;
  fromSymbol?: string;
  toSymbol?: string;
  fromAmount?: string;
  toAmount?: string;
}

function maskAddress(addr?: string) {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function maskIp(ip?: string) {
  return ip ?? "";
}

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const LIVE_EVENTS_KEY = "chainDrop_liveEvents";

function loadStoredEvents(): LiveEvent[] {
  try {
    const raw = localStorage.getItem(LIVE_EVENTS_KEY);
    return raw ? (JSON.parse(raw) as LiveEvent[]) : [];
  } catch { return []; }
}

export function LiveMonitor() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>(() => loadStoredEvents());
  const [paused, setPaused] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const pausedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const successCount = events.filter((e) => e.type === "claim_success" || e.type === "buy_success" || e.type === "swap_success").length;
  const errorCount = events.filter((e) => e.type === "claim_error" || e.type === "rpc_error" || e.type === "server_error" || e.type === "buy_error" || e.type === "swap_error").length;

  // Load DB history once on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const r = await adminFetch("/api/admin/live-history");
        if (!r.ok) return;
        const hist = await r.json() as LiveEvent[];
        if (!hist.length) return;
        setEvents((prev) => {
          // Merge: live events (non-historical) come first, then DB history
          const live = prev.filter(e => !e.historical);
          const liveIds = new Set(live.map(e => e.id));
          const fresh = hist.filter(h => !liveIds.has(h.id));
          const next = [...live, ...fresh].slice(0, 300);
          try { localStorage.setItem(LIVE_EVENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
        setHistoryLoaded(true);
      } catch { /* non-critical */ }
    }
    void loadHistory();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      // Step 1: get a short-lived SSE ticket (avoids JWT in URL)
      let ticket: string;
      try {
        const r = await adminFetch("/api/admin/live-ticket", { method: "POST" });
        if (!r.ok) { setTimeout(connect, 5000); return; }
        const data = await r.json() as { ticket: string };
        ticket = data.ticket;
      } catch { setTimeout(connect, 5000); return; }

      if (cancelled) return;

      // Step 2: open SSE with the ticket
      // Use Railway URL directly so Vercel's 30s proxy timeout doesn't kill the stream
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const es = new EventSource(`${apiBase}/api/admin/live?ticket=${encodeURIComponent(ticket)}`);
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
          setEvents((prev) => {
            // New live events go to the top, above any historical entries
            const historical = prev.filter(p => p.historical);
            const live = prev.filter(p => !p.historical);
            const next = [event, ...live, ...historical].slice(0, 300);
            try { localStorage.setItem(LIVE_EVENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
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
          <Button size="sm" variant="outline" onClick={() => { setEvents([]); try { localStorage.removeItem(LIVE_EVENTS_KEY); } catch { /* ignore */ } }} className="font-mono text-xs h-7 px-2 text-muted-foreground">
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
              {events.map((ev, idx) => {
                const prevEv = events[idx - 1];
                const showHistorySeparator =
                  ev.historical && (idx === 0 || !prevEv?.historical);
                return (
                  <div key={ev.id}>
                    {showHistorySeparator && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/20">
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                          DB History (last 72h)
                        </span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    )}
                    <EventRow event={ev} />
                  </div>
                );
              })}
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
                <div className="text-muted-foreground">{events.find(e => e.rootCause === cause)?.hint ?? events.find(e => e.rootCause === cause)?.detail ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event: ev }: { event: LiveEvent }) {
  const isClaimSuccess = ev.type === "claim_success";
  const isBuySuccess = ev.type === "buy_success";
  const isSwapSuccess = ev.type === "swap_success";
  const isSuccess = isClaimSuccess || isBuySuccess || isSwapSuccess;
  const isError = ev.type === "claim_error" || ev.type === "rpc_error" || ev.type === "server_error" || ev.type === "buy_error" || ev.type === "swap_error";
  const isConnected = ev.type === "connected";

  const typeColor = isBuySuccess ? "text-blue-400" : isSwapSuccess ? "text-purple-400" : isSuccess ? "text-green-400" : isError ? "text-red-400" : isConnected ? "text-primary" : "text-muted-foreground";

  return (
    <div className={cn(
      "px-4 py-3 flex flex-col gap-1.5 text-xs font-mono transition-colors",
      isClaimSuccess && "bg-green-500/5 hover:bg-green-500/10",
      isBuySuccess && "bg-blue-500/5 hover:bg-blue-500/10",
      isSwapSuccess && "bg-purple-500/5 hover:bg-purple-500/10",
      isError && "bg-red-500/5 hover:bg-red-500/10",
      isConnected && "bg-primary/5",
      !isSuccess && !isError && !isConnected && "hover:bg-muted/30",
      ev.historical && "opacity-60",
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        {isClaimSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {isBuySuccess && <ShoppingCart className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
        {isSwapSuccess && <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
        {isError && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {isConnected && <Wifi className="w-3.5 h-3.5 text-primary shrink-0" />}
        {!isSuccess && !isError && !isConnected && <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}

        <span className={cn("font-semibold uppercase tracking-wide", typeColor)}>
          {ev.type.replace(/_/g, " ")}
        </span>

        {ev.chainName && (
          <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-primary/30 text-primary">
            {ev.chainName}
          </Badge>
        )}
        {(ev.fromChainName || ev.toChainName) && (
          <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-purple-400/30 text-purple-400">
            {ev.fromChainName} → {ev.toChainName}
          </Badge>
        )}

        <span className="ml-auto text-muted-foreground text-[10px]">{timeAgo(ev.ts)}</span>
      </div>

      {isClaimSuccess && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
          <span>addr: <span className="text-foreground">{maskAddress(ev.address)}</span></span>
          <span>amount: <span className="text-green-400 font-semibold">{ev.amount} {ev.symbol}</span></span>
          {ev.txHash && <span>tx: <span className="text-foreground">{ev.txHash.slice(0, 12)}…</span></span>}
          {ev.ip && <span>ip: <span className="text-foreground">{maskIp(ev.ip)}</span></span>}
        </div>
      )}

      {isBuySuccess && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
          <span>addr: <span className="text-foreground">{maskAddress(ev.address)}</span></span>
          <span>received: <span className="text-blue-400 font-semibold">{ev.amount} {ev.symbol}</span></span>
          {ev.chainName && <span>chain: <span className="text-foreground">{ev.chainName}</span></span>}
          {ev.txHash && <span>tx: <span className="text-foreground">{ev.txHash.slice(0, 12)}…</span></span>}
        </div>
      )}

      {isSwapSuccess && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
          <span>addr: <span className="text-foreground">{maskAddress(ev.address)}</span></span>
          <span>
            <span className="text-foreground">{ev.fromAmount} {ev.fromSymbol}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="text-purple-400 font-semibold">{ev.toAmount} {ev.toSymbol}</span>
          </span>
          {ev.txHash && <span>tx: <span className="text-foreground">{ev.txHash.slice(0, 12)}…</span></span>}
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
          {ev.hint && (
            <div className="text-[11px] text-yellow-400/80 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              Fix: {ev.hint}
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
