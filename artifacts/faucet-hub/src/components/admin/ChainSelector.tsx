import { useState, useEffect } from "react";
import { Search, X, Loader2, CheckCircle2 } from "lucide-react";
import { adminFetch } from "@/lib/auth";

export interface MasterChain {
  id: number;
  name: string;
  symbol: string;
  chainId: number | null;
  chainType: string;
  logoUrl: string | null;
  rpcUrls: string[];
  explorerUrls: string[];
  isTestnet: boolean;
}

interface ChainSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (chain: MasterChain) => void;
  title?: string;
}

export function ChainSelector({ open, onClose, onSelect, title = "Select from Chain Library" }: ChainSelectorProps) {
  const [chains, setChains] = useState<MasterChain[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    setLoading(true);
    adminFetch("/api/admin/master-chains")
      .then(r => r.ok ? r.json() : [])
      .then((data: MasterChain[]) => setChains(data))
      .catch(() => setChains([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = chains.filter(c => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || String(c.chainId ?? "").includes(q);
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)" }}>

        <div className="flex items-center justify-between px-4 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="font-bold font-mono text-sm text-white">{title}</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, symbol or chain ID…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-primary/40"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "#fff" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-mono">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground px-4 text-center">
              <p className="text-sm font-mono">
                {chains.length === 0
                  ? "Chain Library is empty. Go to the 'Chain Library' tab to add chains first."
                  : "No chains match your search."}
              </p>
            </div>
          ) : (
            filtered.map(chain => (
              <button
                key={chain.id}
                onClick={() => { onSelect(chain); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {chain.logoUrl ? (
                  <img src={chain.logoUrl} alt={chain.name}
                    className="w-8 h-8 rounded-full object-contain shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                    {chain.symbol.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white truncate">{chain.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: chain.isTestnet ? "rgba(250,204,21,0.12)" : "rgba(34,197,94,0.12)",
                        color: chain.isTestnet ? "#facc15" : "#22c55e",
                      }}>
                      {chain.isTestnet ? "Testnet" : "Mainnet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs font-mono text-muted-foreground">
                    <span>{chain.symbol}</span>
                    {chain.chainId != null && <span>ID: {chain.chainId}</span>}
                    <span>{chain.rpcUrls.length} RPC</span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-muted-foreground/25 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
