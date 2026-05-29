import React, { useState, useEffect } from "react";
import { X, Link2, Gift, ChevronLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type Step = "choose" | "chain" | "promo" | "success";

interface Chain { id: number; name: string; symbol: string; }

interface ChainForm {
  contactName: string;
  contactEmail: string;
  contactTelegram: string;
  chainName: string;
  symbol: string;
  networkType: string;
  rpcUrl: string;
  website: string;
  description: string;
  notes: string;
}

interface PromoForm {
  contactName: string;
  contactEmail: string;
  contactTelegram: string;
  projectName: string;
  chainId: string;
  promoCode: string;
  maxClaims: string;
  claimAmount: string;
  contractAddress: string;
  website: string;
  notes: string;
}

const EMPTY_CHAIN: ChainForm = {
  contactName: "", contactEmail: "", contactTelegram: "",
  chainName: "", symbol: "", networkType: "mainnet",
  rpcUrl: "", website: "", description: "", notes: "",
};

const EMPTY_PROMO: PromoForm = {
  contactName: "", contactEmail: "", contactTelegram: "",
  projectName: "", chainId: "", promoCode: "",
  maxClaims: "", claimAmount: "", contractAddress: "",
  website: "", notes: "",
};

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
      fetch("/api/chains").then(r => r.json()).then((data: Chain[]) => setChains(data)).catch(() => {});
    }
  }, [open]);

  function setC(patch: Partial<ChainForm>) { setChainForm(p => ({ ...p, ...patch })); }
  function setP(patch: Partial<PromoForm>) { setPromoForm(p => ({ ...p, ...patch })); }

  async function submitChain() {
    if (!chainForm.contactName || !chainForm.contactEmail || !chainForm.chainName || !chainForm.symbol) {
      setError("Contact Name, Email, Chain Name, Token Symbol are required."); return;
    }
    setError(""); setLoading(true);
    try {
      const message = [
        "📋 CHAIN LISTING REQUEST",
        "─────────────────────────",
        `Contact Name: ${chainForm.contactName}`,
        `Contact Email: ${chainForm.contactEmail}`,
        chainForm.contactTelegram ? `Telegram: ${chainForm.contactTelegram}` : null,
        "",
        `Chain Name: ${chainForm.chainName}`,
        `Token Symbol: ${chainForm.symbol}`,
        `Network Type: ${chainForm.networkType}`,
        chainForm.rpcUrl ? `RPC URL: ${chainForm.rpcUrl}` : null,
        chainForm.website ? `Website: ${chainForm.website}` : null,
        chainForm.description ? `Description: ${chainForm.description}` : null,
        chainForm.notes ? `Notes: ${chainForm.notes}` : null,
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: chainForm.contactName, userEmail: chainForm.contactEmail, message }),
      });
      if (!res.ok) throw new Error("Submission failed");
      const data = await res.json();
      setSuccessId(data.id);
      setStep("success");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPromo() {
    if (!promoForm.contactName || !promoForm.contactEmail || !promoForm.projectName || !promoForm.promoCode || !promoForm.maxClaims || !promoForm.claimAmount) {
      setError("Contact Name, Email, Project Name, Promo Code, Max Claims, Claim Amount are required."); return;
    }
    setError(""); setLoading(true);
    try {
      const selectedChain = chains.find(c => String(c.id) === promoForm.chainId);
      const message = [
        "🎁 PROMO LISTING REQUEST",
        "─────────────────────────",
        `Contact Name: ${promoForm.contactName}`,
        `Contact Email: ${promoForm.contactEmail}`,
        promoForm.contactTelegram ? `Telegram: ${promoForm.contactTelegram}` : null,
        "",
        `Project Name: ${promoForm.projectName}`,
        `Chain: ${selectedChain ? `${selectedChain.name} (${selectedChain.symbol})` : promoForm.chainId || "Not specified"}`,
        `Custom Promo Code: ${promoForm.promoCode}`,
        `Max Claims: ${promoForm.maxClaims}`,
        `Claim Amount: ${promoForm.claimAmount}`,
        promoForm.contractAddress ? `Contract Address: ${promoForm.contractAddress}` : null,
        promoForm.website ? `Website: ${promoForm.website}` : null,
        promoForm.notes ? `Notes: ${promoForm.notes}` : null,
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: promoForm.contactName, userEmail: promoForm.contactEmail, message }),
      });
      if (!res.ok) throw new Error("Submission failed");
      const data = await res.json();
      setSuccessId(data.id);
      setStep("success");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/50 transition-colors";
  const labelCls = "text-[10px] font-mono uppercase tracking-wider text-white/40";
  const rowCls = "space-y-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(135deg, rgba(15,10,30,0.98) 0%, rgba(10,8,20,0.98) 100%)",
          border: "1px solid rgba(168,85,247,0.25)",
          boxShadow: "0 0 60px rgba(168,85,247,0.15), 0 24px 80px rgba(0,0,0,0.8)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(168,85,247,0.15)" }}>
          <div className="flex items-center gap-2">
            {(step === "chain" || step === "promo") && (
              <button onClick={() => { setStep("choose"); setError(""); }}
                className="flex items-center justify-center w-7 h-7 rounded-lg mr-1 transition-colors hover:bg-white/5"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}>
              {step === "promo" ? <Gift className="w-4 h-4" style={{ color: "#c084fc" }} /> : <Link2 className="w-4 h-4" style={{ color: "#c084fc" }} />}
            </div>
            <div>
              <p className="font-mono font-bold text-white text-sm leading-none">
                {step === "choose" && "List Your Project"}
                {step === "chain" && "List Your Chain"}
                {step === "promo" && "List Your Promo"}
                {step === "success" && "Request Submitted"}
              </p>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                {step === "choose" && "Select listing type"}
                {step === "chain" && "Fill in chain details"}
                {step === "promo" && "Fill in promo details"}
                {step === "success" && "We'll be in touch soon"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/8 transition-colors" style={{ color: "rgba(255,255,255,0.45)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">

          {/* ── Choose ── */}
          {step === "choose" && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-white/40 text-center mb-4">
                Want to appear on ChainDrop? Submit a listing request and our team will review it.
              </p>
              <button
                onClick={() => setStep("chain")}
                className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.01]"
                style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
                  <Link2 className="w-5 h-5" style={{ color: "#60a5fa" }} />
                </div>
                <div>
                  <p className="font-mono font-bold text-white text-sm">List Your Chain</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Add your blockchain network as a faucet</p>
                </div>
              </button>

              <button
                onClick={() => setStep("promo")}
                className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.01]"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)" }}>
                  <Gift className="w-5 h-5" style={{ color: "#c084fc" }} />
                </div>
                <div>
                  <p className="font-mono font-bold text-white text-sm">List Your Promo</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Create a custom airdrop promo code for users</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Chain Form ── */}
          {step === "chain" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className={rowCls}>
                  <label className={labelCls}>Contact Name *</label>
                  <input className={inputCls} placeholder="John Doe" value={chainForm.contactName} onChange={e => setC({ contactName: e.target.value })} />
                </div>
                <div className={rowCls}>
                  <label className={labelCls}>Contact Email *</label>
                  <input className={inputCls} type="email" placeholder="you@example.com" value={chainForm.contactEmail} onChange={e => setC({ contactEmail: e.target.value })} />
                </div>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Telegram (optional)</label>
                <input className={inputCls} placeholder="@username" value={chainForm.contactTelegram} onChange={e => setC({ contactTelegram: e.target.value })} />
              </div>

              <div className="border-t my-1" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

              <div className="grid grid-cols-2 gap-3">
                <div className={rowCls}>
                  <label className={labelCls}>Chain Name *</label>
                  <input className={inputCls} placeholder="Ethereum" value={chainForm.chainName} onChange={e => setC({ chainName: e.target.value })} />
                </div>
                <div className={rowCls}>
                  <label className={labelCls}>Token Symbol *</label>
                  <input className={inputCls} placeholder="ETH" value={chainForm.symbol} onChange={e => setC({ symbol: e.target.value })} />
                </div>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Network Type</label>
                <select className={inputCls} value={chainForm.networkType} onChange={e => setC({ networkType: e.target.value })}
                  style={{ appearance: "none" }}>
                  <option value="mainnet">Mainnet</option>
                  <option value="testnet">Testnet</option>
                </select>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>RPC URL</label>
                <input className={inputCls} placeholder="https://rpc.example.com" value={chainForm.rpcUrl} onChange={e => setC({ rpcUrl: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Website</label>
                <input className={inputCls} placeholder="https://yourchain.io" value={chainForm.website} onChange={e => setC({ website: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Description</label>
                <textarea className={inputCls + " resize-none"} rows={3} placeholder="Brief description of your chain..." value={chainForm.description} onChange={e => setC({ description: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Additional Notes</label>
                <textarea className={inputCls + " resize-none"} rows={2} placeholder="Any other details..." value={chainForm.notes} onChange={e => setC({ notes: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Promo Form ── */}
          {step === "promo" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className={rowCls}>
                  <label className={labelCls}>Contact Name *</label>
                  <input className={inputCls} placeholder="John Doe" value={promoForm.contactName} onChange={e => setP({ contactName: e.target.value })} />
                </div>
                <div className={rowCls}>
                  <label className={labelCls}>Contact Email *</label>
                  <input className={inputCls} type="email" placeholder="you@example.com" value={promoForm.contactEmail} onChange={e => setP({ contactEmail: e.target.value })} />
                </div>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Telegram (optional)</label>
                <input className={inputCls} placeholder="@username" value={promoForm.contactTelegram} onChange={e => setP({ contactTelegram: e.target.value })} />
              </div>

              <div className="border-t my-1" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

              <div className={rowCls}>
                <label className={labelCls}>Project Name *</label>
                <input className={inputCls} placeholder="My DeFi Project" value={promoForm.projectName} onChange={e => setP({ projectName: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Chain *</label>
                {chains.length > 0 ? (
                  <select className={inputCls} value={promoForm.chainId} onChange={e => setP({ chainId: e.target.value })} style={{ appearance: "none" }}>
                    <option value="">Select chain...</option>
                    {chains.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name} ({c.symbol})</option>
                    ))}
                  </select>
                ) : (
                  <input className={inputCls} placeholder="e.g. Ethereum Mainnet" value={promoForm.chainId} onChange={e => setP({ chainId: e.target.value })} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={rowCls}>
                  <label className={labelCls}>Custom Promo Code *</label>
                  <input className={inputCls} placeholder="MYPROMO2025" value={promoForm.promoCode} onChange={e => setP({ promoCode: e.target.value.toUpperCase() })} />
                </div>
                <div className={rowCls}>
                  <label className={labelCls}>Max Claims *</label>
                  <input type="number" min="1" className={inputCls} placeholder="100" value={promoForm.maxClaims} onChange={e => setP({ maxClaims: e.target.value })} />
                </div>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Claim Amount (per user) *</label>
                <input type="number" min="0" step="any" className={inputCls} placeholder="0.01" value={promoForm.claimAmount} onChange={e => setP({ claimAmount: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Contract Address</label>
                <input className={inputCls} placeholder="0x..." value={promoForm.contractAddress} onChange={e => setP({ contractAddress: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Website</label>
                <input className={inputCls} placeholder="https://yourproject.io" value={promoForm.website} onChange={e => setP({ website: e.target.value })} />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Additional Notes</label>
                <textarea className={inputCls + " resize-none"} rows={2} placeholder="Any other details about your promo..." value={promoForm.notes} onChange={e => setP({ notes: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
              </div>
              <div>
                <p className="font-mono font-bold text-white text-base">Request Submitted!</p>
                <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Our team will review your request and get back to you via support chat.
                </p>
                {successId && (
                  <p className="text-[11px] font-mono mt-2" style={{ color: "rgba(168,85,247,0.7)" }}>
                    Ticket #{successId}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 rounded-lg font-mono font-bold text-sm transition-all hover:opacity-80"
                style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc" }}
              >
                Close
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f87171" }} />
              <p className="text-xs font-mono" style={{ color: "#f87171" }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer with submit button */}
        {(step === "chain" || step === "promo") && (
          <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <button
              onClick={step === "chain" ? submitChain : submitPromo}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono font-bold text-sm transition-all disabled:opacity-50"
              style={{
                background: loading ? "rgba(168,85,247,0.2)" : "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(139,92,246,0.3) 100%)",
                border: "1px solid rgba(168,85,247,0.4)",
                color: "#c084fc",
                boxShadow: loading ? "none" : "0 0 20px rgba(168,85,247,0.15)",
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : (
                <>{step === "chain" ? <Link2 className="w-4 h-4" /> : <Gift className="w-4 h-4" />} Submit Request</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
