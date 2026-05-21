import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import {
  ArrowLeftRight, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Loader2, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ExchangePair {
  id: number; name: string;
  fromChainName: string; fromSymbol: string; fromChainId: number;
  fromRpcUrl: string; fromExplorerUrl: string | null; fromDepositAddress: string; fromLogoUrl: string | null;
  toChainName: string; toSymbol: string; toChainId: number;
  toRpcUrl: string; toExplorerUrl: string | null; toLogoUrl: string | null;
  feePercent: string; minAmount: string; maxAmount: string; isEnabled: boolean;
}

interface ExchangeOrder {
  id: string; pairId: number; userAddress: string;
  fromAmount: string; feeAmount: string; toAmount: string;
  status: string; fromTxHash: string | null; toTxHash: string | null;
  failReason: string | null; createdAt: string; completedAt: string | null;
}

type FormData = Omit<ExchangePair, "id" | "isEnabled"> & { isEnabled: boolean };

const DEFAULT_FORM: FormData = {
  name: "", fromChainName: "", fromSymbol: "", fromChainId: 1,
  fromRpcUrl: "", fromExplorerUrl: "", fromDepositAddress: "", fromLogoUrl: "",
  toChainName: "", toSymbol: "", toChainId: 8453,
  toRpcUrl: "", toExplorerUrl: "", toLogoUrl: "",
  feePercent: "1.00", minAmount: "0.001", maxAmount: "1.0", isEnabled: true,
};

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, [string, string]> = {
    pending:    ["rgba(250,204,21,0.15)",  "#facc15"],
    confirming: ["rgba(96,165,250,0.15)",  "#60a5fa"],
    completed:  ["rgba(34,197,94,0.15)",   "#22c55e"],
    failed:     ["rgba(239,68,68,0.15)",   "#f87171"],
    expired:    ["rgba(255,255,255,0.07)", "rgba(255,255,255,0.4)"],
  };
  const [bg, color] = MAP[status] ?? MAP.expired;
  return (
    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}>{status}</span>
  );
}

export function ExchangeManagement() {
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pairs" | "orders">("pairs");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchPairs = async () => {
    const res = await fetch("/api/admin/exchange/pairs", { headers: authHeaders() });
    if (res.ok) setPairs(await res.json());
  };
  const fetchOrders = async () => {
    const res = await fetch("/api/admin/exchange/orders", { headers: authHeaders() });
    if (res.ok) setOrders(await res.json());
  };

  useEffect(() => {
    Promise.all([fetchPairs(), fetchOrders()]).finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setEditId(null); setForm(DEFAULT_FORM); setError(""); setFormOpen(true); };
  const openEdit = (p: ExchangePair) => {
    setEditId(p.id);
    setForm({ ...p, fromExplorerUrl: p.fromExplorerUrl ?? "", toExplorerUrl: p.toExplorerUrl ?? "", fromLogoUrl: p.fromLogoUrl ?? "", toLogoUrl: p.toLogoUrl ?? "" });
    setError(""); setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditId(null); setForm(DEFAULT_FORM); setError(""); };

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const body: any = { ...form, fromChainId: Number(form.fromChainId), toChainId: Number(form.toChainId) };
      ["fromExplorerUrl","toExplorerUrl","fromLogoUrl","toLogoUrl"].forEach(k => { if (!body[k]) delete body[k]; });

      const url = editId ? `/api/admin/exchange/pairs/${editId}` : "/api/admin/exchange/pairs";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error || "Save failed"); }
      setSuccess(editId ? "Pair updated!" : "Pair created!");
      await fetchPairs();
      closeForm();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this exchange pair?")) return;
    setDeleting(id);
    await fetch(`/api/admin/exchange/pairs/${id}`, { method: "DELETE", headers: authHeaders() });
    await fetchPairs();
    setDeleting(null);
  };

  const handleToggle = async (p: ExchangePair) => {
    await fetch(`/api/admin/exchange/pairs/${p.id}`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ isEnabled: !p.isEnabled }),
    });
    await fetchPairs();
  };

  const f = (key: keyof FormData, label: string, type = "text", placeholder = "") => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={String(form[key])} placeholder={placeholder}
        onChange={e => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
        className="font-mono text-sm h-9" />
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm font-mono">Loading…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" style={{ color: "#a78bfa" }} /> Exchange Manager
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">Manage swap pairs, fees, limits, and orders</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 font-mono">
          <Plus className="w-3.5 h-3.5" /> Add Pair
        </Button>
      </div>

      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {(["pairs", "orders"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-widest transition-colors"
            style={{ background: tab === t ? "rgba(167,139,250,0.15)" : "transparent", color: tab === t ? "#a78bfa" : "rgba(255,255,255,0.4)" }}>
            {t === "pairs" ? <ArrowLeftRight className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* ── PAIRS TAB ── */}
      {tab === "pairs" && (
        <div className="space-y-3">
          {pairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ArrowLeftRight className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange pairs yet. Add one to get started.</p>
            </div>
          ) : pairs.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold font-mono text-sm text-white">{p.fromSymbol}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" style={{ color: "#a78bfa" }} />
                    <span className="font-bold font-mono text-sm text-white">{p.toSymbol}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground hidden sm:inline truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-muted-foreground">{p.feePercent}% fee</span>
                  <Switch checked={p.isEnabled} onCheckedChange={() => handleToggle(p)} />
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg transition-colors hover:bg-white/10">
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10">
                    {deleting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 text-xs font-mono text-muted-foreground" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div><span className="opacity-60">From</span><br /><span className="text-white">{p.fromChainName}</span></div>
                <div><span className="opacity-60">To</span><br /><span className="text-white">{p.toChainName}</span></div>
                <div><span className="opacity-60">Min</span><br /><span className="text-white">{p.minAmount} {p.fromSymbol}</span></div>
                <div><span className="opacity-60">Max</span><br /><span className="text-white">{p.maxAmount} {p.fromSymbol}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === "orders" && (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ClipboardList className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange orders yet.</p>
            </div>
          ) : orders.map(o => (
            <div key={o.id} className="rounded-xl px-4 py-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-[10px] font-mono text-muted-foreground truncate">{o.id.slice(0, 12)}…</code>
                  <StatusBadge status={o.status} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                <span className="text-white">{o.fromAmount} → {o.toAmount}</span>
                <span className="text-muted-foreground truncate">{o.userAddress.slice(0, 10)}…</span>
                {o.failReason && <span style={{ color: "#f87171" }}>{o.failReason}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h3 className="font-bold font-mono text-white">{editId ? "Edit Exchange Pair" : "New Exchange Pair"}</h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-5">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {f("name", "Pair Name", "text", "e.g. ETH → Base ETH")}

              {/* Global fee + limits */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest" style={{ background: "rgba(167,139,250,0.05)", color: "#a78bfa", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
                  Fee & Limits
                </div>
                <div className="p-4 grid grid-cols-3 gap-3">
                  {f("feePercent", "Fee %", "text", "1.00")}
                  {f("minAmount", "Min Amount", "text", "0.001")}
                  {f("maxAmount", "Max Amount", "text", "1.0")}
                </div>
                <div className="px-4 pb-4 flex items-center gap-3">
                  <Switch checked={form.isEnabled} onCheckedChange={c => setForm({ ...form, isEnabled: c })} />
                  <span className="text-xs font-mono text-muted-foreground">Enabled (visible to users)</span>
                </div>
              </div>

              {/* From chain */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest" style={{ background: "rgba(34,197,94,0.05)", color: "#22c55e", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                  From Chain (Users Send Here)
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {f("fromChainName", "Chain Name", "text", "Ethereum Mainnet")}
                  {f("fromSymbol", "Token Symbol", "text", "ETH")}
                  {f("fromChainId", "Chain ID (EVM)", "number", "1")}
                  {f("fromDepositAddress", "Deposit Address", "text", "0x... (users send here)")}
                  {f("fromRpcUrl", "RPC URL", "text", "https://eth.llamarpc.com")}
                  {f("fromExplorerUrl", "Explorer URL (optional)", "text", "https://etherscan.io")}
                  {f("fromLogoUrl", "Logo URL (optional)", "text", "https://...")}
                </div>
              </div>

              {/* To chain */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(96,165,250,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest" style={{ background: "rgba(96,165,250,0.05)", color: "#60a5fa", borderBottom: "1px solid rgba(96,165,250,0.15)" }}>
                  To Chain (Users Receive Here)
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {f("toChainName", "Chain Name", "text", "Base")}
                  {f("toSymbol", "Token Symbol", "text", "ETH")}
                  {f("toChainId", "Chain ID (EVM)", "number", "8453")}
                  {f("toRpcUrl", "RPC URL", "text", "https://mainnet.base.org")}
                  {f("toExplorerUrl", "Explorer URL (optional)", "text", "https://basescan.org")}
                  {f("toLogoUrl", "Logo URL (optional)", "text", "https://...")}
                </div>
              </div>

              <div className="rounded-xl p-3 text-xs font-mono" style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.2)", color: "rgba(250,204,21,0.8)" }}>
                ⚠ Ensure your FAUCET_PRIVATE_KEY wallet has sufficient {form.toSymbol || "token"} balance on {form.toChainName || "the destination chain"} to fulfill swaps.
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={closeForm} className="flex-1 font-mono">Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 font-mono gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editId ? "Update" : "Create"} Pair
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
