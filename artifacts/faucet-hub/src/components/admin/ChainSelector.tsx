import { useState, useEffect } from "react";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import { adminFetch } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const filtered = chains.filter(c => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || String(c.chainId ?? "").includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{
          background: "#0d1117",
          border: "1px solid rgba(255,255,255,0.12)",
          maxWidth: "32rem",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <DialogHeader
          className="px-4 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <DialogTitle className="font-mono text-sm text-white">{title}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "rgba(255,255,255,0.35)" }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, symbol or chain ID…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/40"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
              }}
            />
          </div>
        </div>

        {/* Chain list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-mono">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
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
                type="button"
                onClick={() => { onSelect(chain); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {chain.logoUrl ? (
                  <img
                    src={chain.logoUrl} alt={chain.name}
                    className="w-8 h-8 rounded-full object-contain shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
                  >
                    {chain.symbol.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white truncate">{chain.name}</span>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: chain.isTestnet ? "rgba(250,204,21,0.12)" : "rgba(34,197,94,0.12)",
                        color: chain.isTestnet ? "#facc15" : "#22c55e",
                      }}
                    >
                      {chain.isTestnet ? "Testnet" : "Mainnet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <span>{chain.symbol}</span>
                    {chain.chainId != null && <span>ID: {chain.chainId}</span>}
                    <span>{chain.rpcUrls.length} RPC</span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
