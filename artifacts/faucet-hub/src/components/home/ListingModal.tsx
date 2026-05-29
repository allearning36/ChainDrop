import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { X, Link2, Gift, ChevronLeft, CheckCircle2, Loader2, AlertCircle, Search, ChevronDown } from "lucide-react";

type Step = "choose" | "chain" | "promo" | "success";

interface Chain { id: number; name: string; symbol: string; isTestnet: boolean; }

interface ChainForm {
  contactName: string;
  contactEmail: string;
  contactTelegram: string;
  chainName: string;
  symbol: string;
  networkType: string;
  description: string;
}

interface PromoForm {
  contactName: string;
  contactEmail: string;
  contactTelegram: string;
  projectName: string;
  chainId: string;
  chainOther: string;
  networkType: string;
  promoCode: string;
  maxClaims: string;
  claimAmount: string;
  contractAddress: string;
  website: string;
}

const EMPTY_CHAIN: ChainForm = {
  contactName: "", contactEmail: "", contactTelegram: "",
  chainName: "", symbol: "", networkType: "mainnet", description: "",
};

const EMPTY_PROMO: PromoForm = {
  contactName: "", contactEmail: "", contactTelegram: "",
  projectName: "", chainId: "", chainOther: "", networkType: "all",
  promoCode: "", maxClaims: "", claimAmount: "", contractAddress: "", website: "",
};

// ── Searchable chain dropdown ──────────────────────────────────────────────────
function ChainDropdown({
  chains,
  value,
  onChange,
}: {
  chains: Chain[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [netFilter, setNetFilter] = useState<"all" | "mainnet" | "testnet">("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const filtered = chains.filter(c => {
    if (netFilter === "mainnet" && c.isTestnet) return false;
    if (netFilter === "testnet" && !c.isTestnet) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = value === "__other__"
    ? { name: "Others (not listed)", symbol: "" }
    : chains.find(c => String(c.id) === value);

  const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/50 transition-colors";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
          background: "rgba(0,0,0,0.3)", border: `1px solid ${open ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`,
          color: selected ? "#fff" : "rgba(255,255,255,0.25)", fontFamily: "monospace", fontSize: 14,
          transition: "border-color 0.2s",
        }}
      >
        <span>
          {selected
            ? selected.symbol
              ? `${selected.name} (${selected.symbol})`
              : selected.name
            : "Select chain..."}
        </span>
        <ChevronDown style={{ width: 14, height: 14, opacity: 0.5, flexShrink: 0 }} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)", zIndex: 10,
          background: "#0f0a1e", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          maxHeight: 260, display: "flex", flexDirection: "column",
        }}>
          {/* Search bar */}
          <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              <input
                autoFocus
                className={inputCls}
                style={{ paddingLeft: 28, paddingTop: 7, paddingBottom: 7 }}
                placeholder="Search chain..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Network filter */}
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {(["all", "mainnet", "testnet"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setNetFilter(f)}
                  style={{
                    flex: 1, padding: "4px 0", borderRadius: 6, fontFamily: "monospace", fontSize: 10,
                    fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
                    background: netFilter === f ? "rgba(168,85,247,0.2)" : "transparent",
                    border: netFilter === f ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    color: netFilter === f ? "#c084fc" : "rgba(255,255,255,0.35)",
                    transition: "all 0.15s",
                  }}
                >
                  {f === "all" ? "All" : f === "mainnet" ? "Mainnet" : "Testnet"}
                </button>
              ))}
            </div>
          </div>

          {/* Chain list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <p style={{ padding: "12px", fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                No chains found
              </p>
            )}
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(String(c.id)); setOpen(false); setSearch(""); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", cursor: "pointer", textAlign: "left",
                  background: String(c.id) === value ? "rgba(168,85,247,0.1)" : "transparent",
                  border: "none", transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (String(c.id) !== value) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (String(c.id) !== value) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#fff" }}>{c.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.symbol}</span>
                  <span style={{
                    fontFamily: "monospace", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                    background: c.isTestnet ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${c.isTestnet ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                    color: c.isTestnet ? "#fbbf24" : "#22c55e",
                    textTransform: "uppercase",
                  }}>
                    {c.isTestnet ? "testnet" : "mainnet"}
                  </span>
                </div>
              </button>
            ))}
            {/* Others option */}
            <button
              type="button"
              onClick={() => { onChange("__other__"); setOpen(false); setSearch(""); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "9px 12px", cursor: "pointer", textAlign: "left",
                background: value === "__other__" ? "rgba(168,85,247,0.1)" : "transparent",
                border: "none", borderTop: "1px solid rgba(255,255,255,0.06)",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (value !== "__other__") (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (value !== "__other__") (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#c084fc" }}>+ Others (not listed)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void; }

export function ListingModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [chainForm, setChainForm] = useState<ChainForm>(EMPTY_CHAIN);
  const [promoForm, setPromoForm] = useState<PromoForm>(EMPTY_PROMO);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setStep("choose");
      setChainForm(EMPTY_CHAIN);
      setPromoForm(EMPTY_PROMO);
      setError("");
      setSuccessId(null);
      fetch("/api/chains").then(r => r.ok ? r.json() : []).then((d: Chain[]) => setChains(d)).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function setC(patch: Partial<ChainForm>) { setChainForm(p => ({ ...p, ...patch })); }
  function setP(patch: Partial<PromoForm>) { setPromoForm(p => ({ ...p, ...patch })); }

  async function submitChain() {
    if (!chainForm.contactName || !chainForm.contactEmail || !chainForm.chainName || !chainForm.symbol) {
      setError("Contact Name, Email, Chain Name and Symbol are required."); return;
    }
    setError(""); setLoading(true);
    try {
      const lines = [
        "📋 CHAIN LISTING REQUEST",
        "─────────────────────────",
        `Contact Name: ${chainForm.contactName}`,
        `Contact Email: ${chainForm.contactEmail}`,
        chainForm.contactTelegram ? `Telegram: ${chainForm.contactTelegram}` : null,
        "",
        `Chain Name: ${chainForm.chainName}`,
        `Token Symbol: ${chainForm.symbol}`,
        `Network Type: ${chainForm.networkType}`,
        chainForm.description ? `Description: ${chainForm.description}` : null,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: chainForm.contactName, userEmail: chainForm.contactEmail, message: lines }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuccessId(data.id);
      setStep("success");
    } catch {
      setError("Submission failed. Please try again.");
    } finally { setLoading(false); }
  }

  async function submitPromo() {
    const chainRequired = promoForm.chainId === "__other__" ? !!promoForm.chainOther : !!promoForm.chainId;
    if (!promoForm.contactName || !promoForm.contactEmail || !promoForm.projectName || !promoForm.promoCode || !promoForm.maxClaims || !promoForm.claimAmount) {
      setError("Contact Name, Email, Project Name, Promo Code, Max Claims and Claim Amount are required."); return;
    }
    setError(""); setLoading(true);
    try {
      const selectedChain = chains.find(c => String(c.id) === promoForm.chainId);
      const chainLabel = promoForm.chainId === "__other__"
        ? `Others / ${promoForm.chainOther || "not specified"}`
        : selectedChain
          ? `${selectedChain.name} (${selectedChain.symbol}) — ${selectedChain.isTestnet ? "Testnet" : "Mainnet"}`
          : promoForm.chainId || "Not specified";
      const lines = [
        "🎁 PROMO LISTING REQUEST",
        "─────────────────────────",
        `Contact Name: ${promoForm.contactName}`,
        `Contact Email: ${promoForm.contactEmail}`,
        promoForm.contactTelegram ? `Telegram: ${promoForm.contactTelegram}` : null,
        "",
        `Project Name: ${promoForm.projectName}`,
        `Chain: ${chainLabel}`,
        `Custom Promo Code: ${promoForm.promoCode}`,
        `Max Claims: ${promoForm.maxClaims}`,
        `Claim Amount: ${promoForm.claimAmount}`,
        promoForm.contractAddress ? `Contract Address: ${promoForm.contractAddress}` : null,
        promoForm.website ? `Website: ${promoForm.website}` : null,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: promoForm.contactName, userEmail: promoForm.contactEmail, message: lines }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuccessId(data.id);
      setStep("success");
    } catch {
      setError("Submission failed. Please try again.");
    } finally { setLoading(false); }
  }

  if (!open) return null;

  const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/50 transition-colors";
  const labelCls = "block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1";

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: "linear-gradient(135deg, #0f0a1e 0%, #0a0814 100%)",
          border: "1px solid rgba(168,85,247,0.25)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 60px rgba(168,85,247,0.12), 0 -4px 40px rgba(0,0,0,0.8)",
          display: "flex", flexDirection: "column",
          maxHeight: "92vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 20px 16px",
          borderBottom: "1px solid rgba(168,85,247,0.12)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(step === "chain" || step === "promo") && (
              <button onClick={() => { setStep("choose"); setError(""); }}
                style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>
                <ChevronLeft style={{ width: 16, height: 16 }} />
              </button>
            )}
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}>
              {step === "promo" ? <Gift style={{ width: 15, height: 15, color: "#c084fc" }} /> : <Link2 style={{ width: 15, height: 15, color: "#c084fc" }} />}
            </div>
            <div>
              <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 14, lineHeight: 1 }}>
                {step === "choose" && "List Your Project"}
                {step === "chain" && "List Your Chain"}
                {step === "promo" && "List Your Promo"}
                {step === "success" && "Request Submitted!"}
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
                {step === "choose" && "Select listing type to continue"}
                {step === "chain" && "Fill in your chain details"}
                {step === "promo" && "Fill in your promo details"}
                {step === "success" && "Our team will contact you soon"}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px" }}>

          {/* ── Choose ── */}
          {step === "choose" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", marginBottom: 4 }}>
                Want to be listed on ChainDrop? Submit a request and our team will review it.
              </p>
              <button onClick={() => setStep("chain")}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, textAlign: "left", background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)", cursor: "pointer" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)" }}>
                  <Link2 style={{ width: 20, height: 20, color: "#60a5fa" }} />
                </div>
                <div>
                  <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 14 }}>List Your Chain</p>
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Add your blockchain network as a faucet</p>
                </div>
              </button>
              <button onClick={() => setStep("promo")}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, textAlign: "left", background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)", cursor: "pointer" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}>
                  <Gift style={{ width: 20, height: 20, color: "#c084fc" }} />
                </div>
                <div>
                  <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 14 }}>List Your Promo</p>
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Create a custom airdrop promo for users</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Chain Form ── */}
          {step === "chain" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className={labelCls}>Contact Name *</label>
                  <input className={inputCls} placeholder="John Doe" value={chainForm.contactName} onChange={e => setC({ contactName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Contact Email *</label>
                  <input className={inputCls} type="email" placeholder="you@example.com" value={chainForm.contactEmail} onChange={e => setC({ contactEmail: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Telegram (optional)</label>
                <input className={inputCls} placeholder="@yourusername" value={chainForm.contactTelegram} onChange={e => setC({ contactTelegram: e.target.value })} />
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className={labelCls}>Chain Name *</label>
                  <input className={inputCls} placeholder="Ethereum" value={chainForm.chainName} onChange={e => setC({ chainName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Token Symbol *</label>
                  <input className={inputCls} placeholder="ETH" value={chainForm.symbol} onChange={e => setC({ symbol: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Network Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["mainnet", "testnet"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setC({ networkType: t })}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 8, fontFamily: "monospace", fontSize: 12,
                        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer",
                        background: chainForm.networkType === t
                          ? t === "mainnet" ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.12)"
                          : "rgba(0,0,0,0.3)",
                        border: chainForm.networkType === t
                          ? t === "mainnet" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(251,191,36,0.35)"
                          : "1px solid rgba(255,255,255,0.1)",
                        color: chainForm.networkType === t
                          ? t === "mainnet" ? "#22c55e" : "#fbbf24"
                          : "rgba(255,255,255,0.35)",
                        transition: "all 0.15s",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Description (optional)</label>
                <textarea className={inputCls + " resize-none"} rows={3} placeholder="Brief description of your chain..." value={chainForm.description} onChange={e => setC({ description: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Promo Form ── */}
          {step === "promo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className={labelCls}>Contact Name *</label>
                  <input className={inputCls} placeholder="John Doe" value={promoForm.contactName} onChange={e => setP({ contactName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Contact Email *</label>
                  <input className={inputCls} type="email" placeholder="you@example.com" value={promoForm.contactEmail} onChange={e => setP({ contactEmail: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Telegram (optional)</label>
                <input className={inputCls} placeholder="@yourusername" value={promoForm.contactTelegram} onChange={e => setP({ contactTelegram: e.target.value })} />
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div>
                <label className={labelCls}>Project Name *</label>
                <input className={inputCls} placeholder="My DeFi Project" value={promoForm.projectName} onChange={e => setP({ projectName: e.target.value })} />
              </div>

              {/* Chain dropdown */}
              <div>
                <label className={labelCls}>Chain</label>
                <ChainDropdown
                  chains={chains}
                  value={promoForm.chainId}
                  onChange={id => setP({ chainId: id, chainOther: "" })}
                />
                {/* If "Others" selected, show text input */}
                {promoForm.chainId === "__other__" && (
                  <input
                    className={inputCls}
                    style={{ marginTop: 8 }}
                    placeholder="Enter chain name..."
                    value={promoForm.chainOther}
                    onChange={e => setP({ chainOther: e.target.value })}
                  />
                )}
              </div>

              <div>
                <label className={labelCls}>Custom Promo Code *</label>
                <input className={inputCls} placeholder="MYPROMO2025" value={promoForm.promoCode} onChange={e => setP({ promoCode: e.target.value.toUpperCase() })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className={labelCls}>Max Claims *</label>
                  <input type="number" min="1" className={inputCls} placeholder="100" value={promoForm.maxClaims} onChange={e => setP({ maxClaims: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Claim Amount *</label>
                  <input type="number" min="0" step="any" className={inputCls} placeholder="0.01" value={promoForm.claimAmount} onChange={e => setP({ claimAmount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Contract Address <span style={{ color: "rgba(255,255,255,0.25)", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <input className={inputCls} placeholder="0x..." value={promoForm.contractAddress} onChange={e => setP({ contractAddress: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Website <span style={{ color: "rgba(255,255,255,0.25)", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <input className={inputCls} placeholder="https://yourproject.io" value={promoForm.website} onChange={e => setP({ website: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0", gap: 16, textAlign: "center" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)" }}>
                <CheckCircle2 style={{ width: 28, height: 28, color: "#22c55e" }} />
              </div>
              <div>
                <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 15 }}>Request Submitted!</p>
                <p style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>
                  Our team will review your request and contact you via email or Telegram.
                </p>
                {successId && (
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(168,85,247,0.7)", marginTop: 8 }}>Ticket #{successId}</p>
                )}
              </div>
              <button onClick={onClose}
                style={{ marginTop: 8, padding: "10px 28px", borderRadius: 10, fontFamily: "monospace", fontWeight: 700, fontSize: 13, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc", cursor: "pointer" }}>
                Close
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: "#f87171" }} />
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#f87171" }}>{error}</p>
            </div>
          )}
        </div>

        {/* Submit footer */}
        {(step === "chain" || step === "promo") && (
          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={step === "chain" ? submitChain : submitPromo}
              disabled={loading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px", borderRadius: 12, fontFamily: "monospace", fontWeight: 700, fontSize: 14,
                background: loading ? "rgba(168,85,247,0.15)" : "linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(139,92,246,0.25) 100%)",
                border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: loading ? "none" : "0 0 20px rgba(168,85,247,0.12)",
              }}
            >
              {loading
                ? <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Submitting...</>
                : <>{step === "chain" ? <Link2 style={{ width: 15, height: 15 }} /> : <Gift style={{ width: 15, height: 15 }} />} Submit Request</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
