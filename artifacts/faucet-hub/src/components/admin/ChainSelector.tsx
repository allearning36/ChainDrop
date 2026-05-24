import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: "32rem", maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          borderRadius: "1rem", overflow: "hidden",
          background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.875rem", color: "#fff" }}>{title}</span>
          <button
            onClick={onClose}
            style={{ padding: "0.25rem", borderRadius: "0.5rem", background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", width: "1rem", height: "1rem", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, symbol or chain ID…"
              style={{
                width: "100%", paddingLeft: "2.25rem", paddingRight: "1rem", paddingTop: "0.5rem", paddingBottom: "0.5rem",
                borderRadius: "0.75rem", fontSize: "0.875rem", fontFamily: "monospace",
                border: "1px solid rgba(255,255,255,0.08)", outline: "none",
                background: "rgba(255,255,255,0.04)", color: "#fff", boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(167,139,250,0.4)")}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", gap: "0.5rem", color: "rgba(255,255,255,0.4)" }}>
              <Loader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              <p style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
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
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.75rem 1rem", textAlign: "left", cursor: "pointer",
                  background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "#fff",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {chain.logoUrl ? (
                  <img
                    src={chain.logoUrl} alt={chain.name}
                    style={{ width: "2rem", height: "2rem", borderRadius: "50%", objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,0.08)" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                    {chain.symbol.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#fff" }}>{chain.name}</span>
                    <span style={{
                      fontSize: "0.625rem", fontFamily: "monospace", padding: "0.125rem 0.375rem", borderRadius: "9999px", flexShrink: 0,
                      background: chain.isTestnet ? "rgba(250,204,21,0.12)" : "rgba(34,197,94,0.12)",
                      color: chain.isTestnet ? "#facc15" : "#22c55e",
                    }}>
                      {chain.isTestnet ? "Testnet" : "Mainnet"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.125rem", fontSize: "0.75rem", fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>
                    <span>{chain.symbol}</span>
                    {chain.chainId != null && <span>ID: {chain.chainId}</span>}
                    <span>{chain.rpcUrls.length} RPC</span>
                  </div>
                </div>
                <CheckCircle2 style={{ width: "1rem", height: "1rem", color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
