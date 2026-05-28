import { useState, useEffect, useCallback, useRef } from "react";
import { adminFetch } from "@/lib/auth";
import {
  Loader2, Plus, Trash2, Gift, ChevronDown, ChevronUp, Copy, Check,
  Search, ToggleLeft, ToggleRight, Link, MessageSquare, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Chain { id: number; name: string; symbol: string; isEnabled: boolean; isTestnet: boolean; }
interface PromoCode {
  id: number; code: string; chainId: number; claimAmount: string;
  maxClaims: number; usedCount: number; isActive: boolean;
  note: string | null; codeLink: string | null; successMessage: string | null;
  createdAt: string; expiresAt: string | null;
}
interface PromoClaim { id: number; address: string; ip: string | null; txHash: string; claimedAt: string; }

function fmt(dt: string) {
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Searchable chain select ───────────────────────────────────────────────────
function ChainSelect({
  chains,
  value,
  onChange,
}: {
  chains: Chain[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = chains.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.symbol.toLowerCase().includes(q.toLowerCase())
  );

  const selected = chains.find(c => String(c.id) === value);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-left focus:outline-none transition-colors hover:border-white/20"
        style={{ color: selected ? "white" : "rgba(255,255,255,0.2)" }}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected ? (
            <>
              <span className="truncate">{selected.name}</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                style={selected.isTestnet
                  ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                  : { background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }
                }
              >
                {selected.isTestnet ? "Testnet" : "Mainnet"}
              </span>
              <span className="text-[10px] font-mono shrink-0" style={{ color: "rgba(34,197,94,0.6)" }}>({selected.symbol})</span>
            </>
          ) : "Select chain…"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-white/30" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: "rgba(12,12,18,0.98)", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "240px", minWidth: "260px", width: "max-content", maxWidth: "calc(100vw - 32px)" }}
        >
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
              <Search className="w-3 h-3 text-white/30 shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-xs font-mono text-white placeholder:text-white/20 focus:outline-none"
                placeholder="Search chains…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto" style={{ maxHeight: "180px" }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs font-mono text-white/30 text-center">No chains found</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(String(c.id)); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5"
                  style={{ color: String(c.id) === value ? "#4ade80" : "rgba(255,255,255,0.75)" }}
                >
                  <span className="flex-1 text-xs font-mono whitespace-nowrap">{c.name}</span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ml-2"
                    style={c.isTestnet
                      ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                      : { background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }
                    }
                  >
                    {c.isTestnet ? "T" : "M"}
                  </span>
                  <span className="text-[10px] font-mono shrink-0 w-10 text-right" style={{ color: "rgba(34,197,94,0.5)" }}>{c.symbol}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function PromoManagement() {
  const [chains, setChains]             = useState<Chain[]>([]);
  const [promos, setPromos]             = useState<PromoCode[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [claims, setClaims]             = useState<Record<number, PromoClaim[]>>({});
  const [loadingClaims, setLoadingClaims] = useState<number | null>(null);
  const [copied, setCopied]             = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(true);
  const [captchaToggling, setCaptchaToggling] = useState(false);

  const [form, setForm] = useState({
    code: "", chainId: "", claimAmount: "", maxClaims: "100",
    note: "", expiresAt: "", codeLink: "", successMessage: "",
  });
  const [showCodeLink,   setShowCodeLink]   = useState(false);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, pr, cfg] = await Promise.all([
        adminFetch("/api/admin/chains"),
        adminFetch("/api/admin/promo"),
        adminFetch("/api/admin/promo/config"),
      ]);
      if (cr.ok) setChains((await cr.json() as Chain[]).filter(c => c.isEnabled));
      if (pr.ok) setPromos(await pr.json() as PromoCode[]);
      if (cfg.ok) setCaptchaEnabled(((await cfg.json()) as { captchaEnabled: boolean }).captchaEnabled);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function loadClaims(promoId: number) {
    if (claims[promoId]) { setExpandedId(p => p === promoId ? null : promoId); return; }
    setLoadingClaims(promoId);
    try {
      const res = await adminFetch(`/api/admin/promo/${promoId}/claims`);
      if (res.ok) { const data = await res.json() as PromoClaim[]; setClaims(p => ({ ...p, [promoId]: data })); }
    } catch { /* ignore */ }
    setLoadingClaims(null);
    setExpandedId(promoId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.chainId || !form.claimAmount) { setError("Code, chain and amount are required."); return; }
    setSaving(true); setError("");
    try {
      const res = await adminFetch("/api/admin/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:           form.code,
          chainId:        parseInt(form.chainId),
          claimAmount:    form.claimAmount,
          maxClaims:      parseInt(form.maxClaims) || 100,
          note:           form.note || undefined,
          codeLink:       form.codeLink || undefined,
          successMessage: form.successMessage || undefined,
          expiresAt:      form.expiresAt || undefined,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to create"); }
      else {
        setForm(p => ({ ...p, code: "", claimAmount: "", maxClaims: "100", note: "", expiresAt: "", codeLink: "", successMessage: "" }));
        await load();
      }
    } catch { setError("Network error"); }
    setSaving(false);
  }

  async function handleToggle(id: number) {
    try {
      const res = await adminFetch(`/api/admin/promo/${id}/toggle`, { method: "PATCH" });
      if (res.ok) setPromos(ps => ps.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
    } catch { /* ignore */ }
  }

  async function handleToggleCaptcha() {
    setCaptchaToggling(true);
    try {
      const next = !captchaEnabled;
      const res = await adminFetch("/api/admin/promo/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaEnabled: next }),
      });
      if (res.ok) setCaptchaEnabled(next);
    } catch { /* ignore */ }
    setCaptchaToggling(false);
  }

  async function handleDelete(id: number, code: string) {
    if (!window.confirm(`Delete promo code "${code}"? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`/api/admin/promo/${id}`, { method: "DELETE" });
      if (res.ok) { setPromos(ps => ps.filter(p => p.id !== id)); setClaims(c => { const n = { ...c }; delete n[id]; return n; }); }
    } catch { /* ignore */ }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const chainName   = (id: number) => chains.find(c => c.id === id)?.name ?? `Chain #${id}`;
  const chainSymbol = (id: number) => chains.find(c => c.id === id)?.symbol ?? "";
  const chainIsTestnet = (id: number) => chains.find(c => c.id === id)?.isTestnet ?? true;

  // Search filter
  const filteredPromos = promos.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      (p.note ?? "").toLowerCase().includes(q) ||
      chainName(p.chainId).toLowerCase().includes(q) ||
      chainSymbol(p.chainId).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold font-mono text-white">Promo Codes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Create airdrop codes for specific chains. Users enter the code to claim a custom amount.</p>
        </div>
        {/* CAPTCHA toggle */}
        <div className="flex items-center gap-2 shrink-0 rounded-lg px-3 py-2"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 whitespace-nowrap">Claim CAPTCHA</span>
          <button
            type="button"
            disabled={captchaToggling}
            onClick={handleToggleCaptcha}
            className="transition-opacity disabled:opacity-50"
          >
            {captchaEnabled
              ? <ToggleRight className="w-7 h-7 text-green-400" />
              : <ToggleLeft  className="w-7 h-7 text-white/25" />
            }
          </button>
        </div>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate}
        className="rounded-xl p-4 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-xs font-mono font-semibold text-white/70 uppercase tracking-wider">New Promo Code</p>

        {error && (
          <div className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Code */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Code</label>
            <div className="flex gap-1.5">
              <input
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50 uppercase"
                placeholder="AIRDROP2024"
                value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              />
              <button type="button" onClick={() => setForm(p => ({ ...p, code: generateCode() }))}
                className="px-2 rounded-lg text-xs font-mono text-green-400 border border-green-500/20 hover:bg-green-500/10 transition-colors shrink-0"
                title="Generate random code"
              >
                RNG
              </button>
            </div>
          </div>

          {/* Chain (searchable) */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Chain</label>
            <ChainSelect chains={chains} value={form.chainId} onChange={v => setForm(p => ({ ...p, chainId: v }))} />
          </div>

          {/* Claim Amount */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Claim Amount</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50"
              placeholder="0.1"
              value={form.claimAmount}
              onChange={e => setForm(p => ({ ...p, claimAmount: e.target.value }))}
            />
          </div>

          {/* Max Claims */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Max Claims</label>
            <input
              type="number" min="1"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50"
              placeholder="100"
              value={form.maxClaims}
              onChange={e => setForm(p => ({ ...p, maxClaims: e.target.value }))}
            />
          </div>

          {/* Expires At */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Expires At (optional)</label>
            <input
              type="datetime-local"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-green-500/50"
              value={form.expiresAt}
              onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
            />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Note (optional)</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50"
              placeholder="Internal note…"
              value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
            />
          </div>

          {/* Get Code link — toggle */}
          <div className="col-span-2">
            {!showCodeLink ? (
              <button
                type="button"
                onClick={() => setShowCodeLink(true)}
                className="flex items-center gap-1.5 text-[11px] font-mono text-white/35 hover:text-white/60 transition-colors px-2.5 py-1.5 rounded-lg border border-white/8 hover:border-white/20"
              >
                <Plus className="w-3 h-3" />
                <Link className="w-3 h-3" />
                Add Get Code Link
              </button>
            ) : (
              <div className="space-y-1 rounded-lg border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                <label className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/40">
                  <span className="flex items-center gap-1.5"><Link className="w-3 h-3" /> Get Code Link</span>
                  <button type="button"
                    onClick={() => { setShowCodeLink(false); setForm(p => ({ ...p, codeLink: "" })); }}
                    className="text-white/25 hover:text-white/60 transition-colors"
                  ><X className="w-3.5 h-3.5" /></button>
                </label>
                <input
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50"
                  placeholder="https://t.me/... or https://twitter.com/..."
                  value={form.codeLink}
                  onChange={e => setForm(p => ({ ...p, codeLink: e.target.value }))}
                  autoFocus
                />
                <p className="text-[10px] text-white/25">A "Get Code" button will appear in the claim modal linking here.</p>
              </div>
            )}
          </div>

          {/* Success message — toggle */}
          <div className="col-span-2">
            {!showSuccessMsg ? (
              <button
                type="button"
                onClick={() => setShowSuccessMsg(true)}
                className="flex items-center gap-1.5 text-[11px] font-mono text-white/35 hover:text-white/60 transition-colors px-2.5 py-1.5 rounded-lg border border-white/8 hover:border-white/20"
              >
                <Plus className="w-3 h-3" />
                <MessageSquare className="w-3 h-3" />
                Add Custom Success Message
              </button>
            ) : (
              <div className="space-y-1 rounded-lg border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                <label className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/40">
                  <span className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Success Message</span>
                  <button type="button"
                    onClick={() => { setShowSuccessMsg(false); setForm(p => ({ ...p, successMessage: "" })); }}
                    className="text-white/25 hover:text-white/60 transition-colors"
                  ><X className="w-3.5 h-3.5" /></button>
                </label>
                <input
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50"
                  placeholder="Thank you for participating in our airdrop!"
                  value={form.successMessage}
                  onChange={e => setForm(p => ({ ...p, successMessage: e.target.value }))}
                  autoFocus
                />
                <p className="text-[10px] text-white/25">Shown after a successful claim. Leave blank for the default message.</p>
              </div>
            )}
          </div>
        </div>

        <Button type="submit" disabled={saving} size="sm"
          className="font-mono text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Plus className="w-3 h-3 mr-1.5" />}
          Create Promo
        </Button>
      </form>

      {/* Search bar */}
      {promos.length > 0 && (
        <div className="flex items-center gap-2 bg-white/3 rounded-lg px-3 py-2 border border-white/7">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm font-mono text-white placeholder:text-white/20 focus:outline-none"
            placeholder="Search by code, chain, or note…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-white/30 hover:text-white transition-colors text-xs font-mono">
              ×
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm font-mono py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-mono">{search ? "No results found" : "No promo codes yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPromos.map(promo => {
            const isExpanded = expandedId === promo.id;
            const isExpired  = promo.expiresAt ? new Date(promo.expiresAt) < new Date() : false;
            const isFull     = promo.usedCount >= promo.maxClaims;
            const statusColor = !promo.isActive ? "rgba(239,68,68,0.7)" : isExpired || isFull ? "rgba(245,158,11,0.7)" : "rgba(34,197,94,0.7)";
            const statusLabel = !promo.isActive ? "INACTIVE" : isExpired ? "EXPIRED" : isFull ? "FULL" : "ACTIVE";
            const isTestnet   = chainIsTestnet(promo.chainId);

            return (
              <div key={promo.id} className="rounded-xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Code + copy */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-sm text-white tracking-widest">{promo.code}</span>
                    <button onClick={() => copyCode(promo.code)}
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-white/30 hover:text-white/60 transition-colors"
                    >
                      {copied === promo.code ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Chain + testnet/mainnet badge + amount */}
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono text-white/50 truncate">{chainName(promo.chainId)}</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={isTestnet
                        ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                        : { background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }
                      }
                    >
                      {isTestnet ? "T" : "M"}
                    </span>
                    <span className="text-xs font-mono font-bold text-green-400">{promo.claimAmount} {chainSymbol(promo.chainId)}</span>
                  </div>

                  {/* Usage */}
                  <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-white/40 ml-auto">
                    <span style={{ color: statusColor }}>{promo.usedCount}</span>
                    <span>/</span>
                    <span>{promo.maxClaims}</span>
                  </div>

                  {/* Status badge */}
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30` }}
                  >
                    {statusLabel}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle — larger */}
                    <button
                      onClick={() => handleToggle(promo.id)}
                      title={promo.isActive ? "Deactivate" : "Activate"}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all text-xs font-mono"
                      style={{
                        background: promo.isActive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.08)",
                        border: promo.isActive ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(239,68,68,0.2)",
                      }}
                    >
                      {promo.isActive
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5 text-red-400/70" />}
                    </button>
                    <button onClick={() => handleDelete(promo.id, promo.code)} title="Delete"
                      className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => loadClaims(promo.id)} title="View claims"
                      className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-white transition-colors"
                    >
                      {loadingClaims === promo.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="sm:hidden flex items-center gap-2 px-4 pb-2 text-xs font-mono text-white/40">
                  <span>{chainName(promo.chainId)}</span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={isTestnet
                      ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                      : { background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }
                    }
                  >
                    {isTestnet ? "Testnet" : "Mainnet"}
                  </span>
                  <span className="text-green-400 font-bold">{promo.claimAmount} {chainSymbol(promo.chainId)}</span>
                  <span className="ml-auto">{promo.usedCount}/{promo.maxClaims} used</span>
                </div>

                {/* Meta */}
                <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span className="text-[10px] font-mono text-white/25">Created {fmt(promo.createdAt)}</span>
                  {promo.expiresAt && <span className="text-[10px] font-mono text-white/25">Expires {fmt(promo.expiresAt)}</span>}
                  {promo.note && <span className="text-[10px] font-mono text-white/40 italic">{promo.note}</span>}
                  {promo.codeLink && (
                    <a href={promo.codeLink} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-purple-400/70 hover:text-purple-400 flex items-center gap-0.5">
                      <Link className="w-2.5 h-2.5" /> Get Code link set
                    </a>
                  )}
                  {promo.successMessage && (
                    <span className="text-[10px] font-mono text-blue-400/60 flex items-center gap-0.5">
                      <MessageSquare className="w-2.5 h-2.5" /> Custom message set
                    </span>
                  )}
                </div>

                {/* Claims list */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-white/30 mb-2">
                      Claim History ({(claims[promo.id] ?? []).length})
                    </p>
                    {(claims[promo.id] ?? []).length === 0 ? (
                      <p className="text-xs font-mono text-white/25">No claims yet.</p>
                    ) : (
                      (claims[promo.id] ?? []).map(cl => (
                        <div key={cl.id} className="flex items-center gap-2 text-[11px] font-mono text-white/50">
                          <span className="truncate max-w-[180px]">{cl.address}</span>
                          <span className="text-white/25 shrink-0">{fmt(cl.claimedAt)}</span>
                          {cl.txHash && (
                            <span className="ml-auto text-white/25 truncate max-w-[120px]" title={cl.txHash}>
                              {cl.txHash.slice(0, 12)}…
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
