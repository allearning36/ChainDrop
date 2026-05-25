import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

type WalletInfo = {
  id: number; name: string; symbol: string; logoUrl: string | null;
  chainType: string; isTestnet: boolean; isEnabled: boolean;
  walletAddress: string; claimAmount: string; balance: string | null;
};

async function fetchWallets(): Promise<WalletInfo[]> {
  const res = await adminFetch("/api/admin/wallet-health");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function getExplorerUrl(chainType: string, isTestnet: boolean, address: string): string {
  switch (chainType) {
    case "solana":
      return isTestnet
        ? `https://explorer.solana.com/address/${address}?cluster=devnet`
        : `https://explorer.solana.com/address/${address}`;
    case "ton":
      return isTestnet
        ? `https://testnet.tonscan.org/address/${address}`
        : `https://tonscan.org/address/${address}`;
    case "sui":
      return isTestnet
        ? `https://testnet.suivision.xyz/address/${address}`
        : `https://suivision.xyz/address/${address}`;
    case "aptos":
      return isTestnet
        ? `https://explorer.aptoslabs.com/account/${address}?network=testnet`
        : `https://explorer.aptoslabs.com/account/${address}`;
    default: // evm
      if (isTestnet) return `https://sepolia.etherscan.io/address/${address}`;
      return `https://etherscan.io/address/${address}`;
  }
}

const CHAIN_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  evm:    { label: "EVM",    color: "#6366f1" },
  solana: { label: "SOL",   color: "#9945ff" },
  ton:    { label: "TON",   color: "#0088cc" },
  sui:    { label: "SUI",   color: "#4da2ff" },
  aptos:  { label: "APT",   color: "#00c2a8" },
};

export function WalletHealth() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try { setWallets(await fetchWallets()); setLastUpdated(new Date()); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function balanceStatus(balance: string | null, claimAmount: string) {
    if (balance === null) return "error";
    const b = parseFloat(balance);
    const c = parseFloat(claimAmount);
    if (b < c) return "critical";
    if (b < c * 5) return "low";
    return "ok";
  }

  const statusColors = {
    ok: { bg: "rgba(34,197,94,0.12)", text: "#22c55e", label: "Healthy" },
    low: { bg: "rgba(234,179,8,0.12)", text: "#eab308", label: "Low" },
    critical: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", label: "Critical" },
    error: { bg: "rgba(239,68,68,0.08)", text: "#f87171", label: "Error" },
  };

  const totalChains = wallets.length;
  const healthy = wallets.filter(w => balanceStatus(w.balance, w.claimAmount) === "ok").length;
  const issues = totalChains - healthy;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-primary mb-1">Wallet Health</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { timeStyle: "short" })}` : "Fetching balances…"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 font-mono text-xs h-9">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Wallets", value: totalChains, color: "#22c55e" },
          { label: "Healthy", value: healthy, color: "#22c55e" },
          { label: "Need Attention", value: issues, color: issues > 0 ? "#ef4444" : "#22c55e" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-2xl font-black font-mono" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Wallet cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading && wallets.length === 0 && (
          <div className="col-span-2 py-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin inline mb-2" /><br />Fetching balances…
          </div>
        )}
        {wallets.map(w => {
          const status = balanceStatus(w.balance, w.claimAmount);
          const sc = statusColors[status];
          const explorerUrl = getExplorerUrl(w.chainType, w.isTestnet, w.walletAddress);
          const ctBadge = CHAIN_TYPE_BADGE[w.chainType] ?? { label: w.chainType.toUpperCase(), color: "#888" };
          return (
            <div key={w.id} className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${status === "ok" ? "rgba(255,255,255,0.08)" : sc.text + "40"}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {w.logoUrl
                    ? <img src={w.logoUrl} alt={w.name} className="w-7 h-7 rounded-full object-cover" />
                    : <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{(w.symbol ?? "??").slice(0, 2)}</div>
                  }
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold text-sm font-mono">{w.name}</div>
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: ctBadge.color + "22", color: ctBadge.color, border: `1px solid ${ctBadge.color}44` }}
                      >
                        {ctBadge.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{w.isTestnet ? "Testnet" : "Mainnet"}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                  {status === "ok" ? <CheckCircle2 className="w-3 h-3 inline mr-0.5" /> : <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                  {sc.label}
                </span>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={`font-bold ${status === "ok" ? "text-green-400" : status === "low" ? "text-yellow-400" : "text-red-400"}`}>
                    {w.balance !== null ? `${parseFloat(w.balance).toFixed(6)} ${w.symbol}` : "Unable to fetch"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per claim</span>
                  <span>{w.claimAmount} {w.symbol}</span>
                </div>
                {w.balance !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining claims</span>
                    <span className="font-semibold">
                      ~{Math.floor(parseFloat(w.balance) / parseFloat(w.claimAmount)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <a href={explorerUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-2.5 h-2.5" />
                {w.walletAddress ? `${w.walletAddress.slice(0, 10)}…${w.walletAddress.slice(-6)}` : "No address"}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
