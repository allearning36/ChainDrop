import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEOHead } from "@/components/layout/SEOHead";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChainStatus {
  id: number;
  name: string;
  symbol: string;
  logoUrl: string | null;
  isTestnet: boolean;
  isEnabled: boolean;
  availableStatus: string;
  cooldownHours: number;
  claimAmount: string;
}

function StatusBadge({ isEnabled, available }: { isEnabled: boolean; available: string }) {
  if (!isEnabled) return (
    <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
      <XCircle className="w-3.5 h-3.5" /> Disabled
    </span>
  );
  if (available === "NO") return (
    <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-destructive/15 text-destructive">
      <AlertCircle className="w-3.5 h-3.5" /> Unavailable
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary">
      <CheckCircle2 className="w-3.5 h-3.5" /> Operational
    </span>
  );
}

export default function StatusPage() {
  const [chains, setChains] = useState<ChainStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tab, setTab] = useState<"testnet" | "mainnet">("testnet");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [testRes, mainRes] = await Promise.all([
        fetch("/api/chains?type=testnet"),
        fetch("/api/chains?type=mainnet"),
      ]);
      const [testData, mainData] = await Promise.all([
        testRes.json() as Promise<ChainStatus[]>,
        mainRes.json() as Promise<ChainStatus[]>,
      ]);
      setChains([...testData, ...mainData]);
      setLastUpdated(new Date());
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = chains.filter(c => c.isTestnet === (tab === "testnet"));
  const allOk = filtered.every(c => c.isEnabled && c.availableStatus !== "NO");
  const anyDown = filtered.some(c => !c.isEnabled || c.availableStatus === "NO");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <SEOHead title="System Status — ChainDrop" />
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold font-mono mb-2">System Status</h1>
            <p className="text-muted-foreground text-sm">Real-time status of all ChainDrop faucet networks.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="font-mono text-xs"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Refresh
          </Button>
        </div>

        {/* Overall status banner */}
        {!loading && (
          <div className={`rounded-xl border p-4 mb-8 flex items-center gap-3 ${allOk ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
            {allOk
              ? <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              : <AlertCircle className="w-5 h-5 text-destructive shrink-0" />}
            <div>
              <p className="font-mono font-semibold text-sm">
                {allOk ? "All systems operational" : anyDown ? "Some services are degraded" : "Checking..."}
              </p>
              {lastUpdated && <p className="text-xs text-muted-foreground mt-0.5">Last updated {lastUpdated.toLocaleTimeString()}</p>}
            </div>
          </div>
        )}

        {/* Network tabs */}
        <div className="flex gap-2 mb-6">
          {(["testnet", "mainnet"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-mono border transition-colors ${tab === t ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Chain cards */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 font-mono">No {tab} networks configured.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(chain => (
              <div key={chain.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {chain.logoUrl
                    ? <img src={chain.logoUrl} alt={chain.name} className="w-9 h-9 rounded-full object-contain bg-muted" />
                    : <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-mono font-bold text-muted-foreground">{chain.symbol.slice(0, 3)}</div>}
                  <div>
                    <p className="font-mono font-semibold text-sm">{chain.name}</p>
                    <p className="text-xs text-muted-foreground">{chain.claimAmount} {chain.symbol} · {chain.cooldownHours}h cooldown</p>
                  </div>
                </div>
                <StatusBadge isEnabled={chain.isEnabled} available={chain.availableStatus} />
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
