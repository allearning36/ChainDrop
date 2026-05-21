import { useState, useEffect, useRef } from "react";
import { getToken } from "@/lib/auth";
import {
  ArrowLeftRight, Plus, Trash2, Edit2, Save, X,
  ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Loader2,
  ClipboardList, Activity, ArrowUp, ArrowDown, Upload, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ExchangePair {
  id: number; name: string;
  fromChainName: string; fromSymbol: string; fromChainId: number;
  fromRpcUrl: string; fromRpcUrls: string | null;
  fromExplorerUrl: string | null; fromDepositAddress: string; fromLogoUrl: string | null;
  toChainName: string; toSymbol: string; toChainId: number;
  toRpcUrl: string; toRpcUrls: string | null;
  toExplorerUrl: string | null; toLogoUrl: string | null;
  feePercent: string; minAmount: string; maxAmount: string; isEnabled: boolean;
}

interface ExchangeOrder {
  id: string; pairId: number; userAddress: string;
  fromAmount: string; feeAmount: string; toAmount: string;
  status: string; fromTxHash: string | null; toTxHash: string | null;
  failReason: string | null; createdAt: string; completedAt: string | null;
}

type RpcHealth = Record<string, { status: "ok" | "error"; latencyMs: number; error?: string }>;

interface FormData {
  name: string;
  fromChainName: string; fromSymbol: string; fromChainId: number;
  fromExplorerUrl: string; fromDepositAddress: string; fromLogoUrl: string;
  toChainName: string; toSymbol: string; toChainId: number;
  toExplorerUrl: string; toLogoUrl: string;
  feePercent: string; minAmount: string; maxAmount: string; isEnabled: boolean;
}

const DEFAULT_FORM: FormData = {
  name: "", fromChainName: "", fromSymbol: "", fromChainId: 1,
  fromExplorerUrl: "", fromDepositAddress: "", fromLogoUrl: "",
  toChainName: "", toSymbol: "", toChainId: 8453,
  toExplorerUrl: "", toLogoUrl: "",
  feePercent: "1.00", minAmount: "0.001", maxAmount: "1.0", isEnabled: true,
};

function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

function parseRpcList(urls: string | null, fallback: string): string[] {
  if (urls) {
    try {
      const parsed = JSON.parse(urls);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* ignore */ }
  }
  return [fallback];
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

// ── Multi-RPC editor ──────────────────────────────────────────────────────────
function RpcEditor({
  label, color, rpcList, setRpcList, health, onCheckHealth, checking, pairId,
}: {
  label: string; color: string;
  rpcList: string[]; setRpcList: (v: string[]) => void;
  health: RpcHealth; onCheckHealth: () => void; checking: boolean;
  pairId: number | null;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rpcList.length) return;
    const copy = [...rpcList];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    setRpcList(copy);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1.5">
          {pairId && (
            <Button type="button" variant="outline" size="sm"
              className="h-6 px-2 text-[10px] font-mono gap-1"
              onClick={onCheckHealth} disabled={checking}>
              {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
              Health
            </Button>
          )}
          <Button type="button" variant="outline" size="sm"
            className="h-6 px-2 text-[10px] font-mono gap-1"
            onClick={() => setRpcList([...rpcList, ""])}>
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {rpcList.map((url, i) => {
          const h = health[url];
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 text-right">
                {i === 0 ? "Primary" : `Fallback ${i}`}
              </span>
              <div className="relative flex-1">
                <Input
                  value={url}
                  onChange={e => {
                    const copy = [...rpcList];
                    copy[i] = e.target.value;
                    setRpcList(copy);
                  }}
                  placeholder="https://rpc.example.com"
                  className="font-mono text-xs h-8 pr-8"
                />
                {h && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    {h.status === "ok"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  </span>
                )}
              </div>
              {h && (
                <span className={`text-[10px] font-mono shrink-0 w-14 ${h.status === "ok" ? "text-green-400" : "text-red-400"}`}>
                  {h.status === "ok" ? `${h.latencyMs}ms` : "Down"}
                </span>
              )}
              <div className="flex gap-0.5 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="w-3 h-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => move(i, 1)} disabled={i === rpcList.length - 1}>
                  <ArrowDown className="w-3 h-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setRpcList(rpcList.filter((_, idx) => idx !== i))}
                  disabled={rpcList.length === 1}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        Primary used first. Fallbacks activate if primary is down.
      </p>
    </div>
  );
}

// ── Logo uploader ─────────────────────────────────────────────────────────────
function LogoUploader({
  value, onChange, label,
}: { value: string; onChange: (url: string) => void; label: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json() as { url: string };
      onChange(data.url);
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {value && (
          <img src={value} alt="" className="w-8 h-8 rounded-full object-contain shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}
            onError={e => (e.currentTarget.style.display = "none")} />
        )}
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="https://... or upload below"
            className="font-mono text-xs h-8 flex-1"
          />
          <Button type="button" variant="outline" size="sm"
            className="h-8 px-2.5 text-xs font-mono gap-1.5 shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "…" : "Upload"}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
      </div>
      {error && <p className="text-[10px] font-mono" style={{ color: "#f87171" }}>{error}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ExchangeManagement() {
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pairs" | "orders">("pairs");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  // RPC lists for from/to
  const [fromRpcs, setFromRpcs] = useState<string[]>([""]);
  const [toRpcs, setToRpcs] = useState<string[]>([""]);

  // Health check state
  const [fromHealth, setFromHealth] = useState<RpcHealth>({});
  const [toHealth, setToHealth] = useState<RpcHealth>({});
  const [checkingFrom, setCheckingFrom] = useState(false);
  const [checkingTo, setCheckingTo] = useState(false);

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

  const checkHealth = async (side: "from" | "to") => {
    if (!editId) return;
    const setSide = side === "from" ? setCheckingFrom : setCheckingTo;
    const setHealth = side === "from" ? setFromHealth : setToHealth;
    setSide(true);
    try {
      const res = await fetch(`/api/admin/exchange/pairs/${editId}/rpc-health?side=${side}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as Array<{ url: string; status: "ok" | "error"; latencyMs: number; error?: string }>;
      const map: RpcHealth = {};
      for (const item of data) map[item.url] = item;
      setHealth(map);
    } catch { /* ignore */ }
    finally { setSide(false); }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setFromRpcs([""]);
    setToRpcs([""]);
    setFromHealth({}); setToHealth({});
    setError(""); setFormOpen(true);
  };

  const openEdit = (p: ExchangePair) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      fromChainName: p.fromChainName, fromSymbol: p.fromSymbol, fromChainId: p.fromChainId,
      fromExplorerUrl: p.fromExplorerUrl ?? "", fromDepositAddress: p.fromDepositAddress,
      fromLogoUrl: p.fromLogoUrl ?? "",
      toChainName: p.toChainName, toSymbol: p.toSymbol, toChainId: p.toChainId,
      toExplorerUrl: p.toExplorerUrl ?? "", toLogoUrl: p.toLogoUrl ?? "",
      feePercent: p.feePercent, minAmount: p.minAmount, maxAmount: p.maxAmount,
      isEnabled: p.isEnabled,
    });
    setFromRpcs(parseRpcList(p.fromRpcUrls, p.fromRpcUrl));
    setToRpcs(parseRpcList(p.toRpcUrls, p.toRpcUrl));
    setFromHealth({}); setToHealth({});
    setError(""); setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditId(null); setError(""); };

  const handleSave = async () => {
    const validFrom = fromRpcs.filter(u => u.trim());
    const validTo = toRpcs.filter(u => u.trim());
    if (!form.name || !form.fromChainName || !form.fromSymbol || !form.fromDepositAddress ||
        !form.toChainName || !form.toSymbol || validFrom.length === 0 || validTo.length === 0) {
      setError("Please fill all required fields and at least one RPC per chain."); return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const body: Record<string, unknown> = {
        ...form,
        fromChainId: Number(form.fromChainId),
        toChainId: Number(form.toChainId),
        fromRpcUrl: validFrom[0],
        fromRpcUrls: JSON.stringify(validFrom),
        toRpcUrl: validTo[0],
        toRpcUrls: JSON.stringify(validTo),
      };
      ["fromExplorerUrl","toExplorerUrl","fromLogoUrl","toLogoUrl"].forEach(k => {
        if (!body[k]) delete body[k];
      });
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
      {/* Header */}
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {(["pairs", "orders"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-widest transition-colors"
            style={{
              background: tab === t ? "rgba(167,139,250,0.15)" : "transparent",
              color: tab === t ? "#a78bfa" : "rgba(255,255,255,0.4)",
            }}>
            {t === "pairs" ? <ArrowLeftRight className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Pairs tab */}
      {tab === "pairs" && (
        <div className="space-y-3">
          {pairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ArrowLeftRight className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange pairs yet. Add one to get started.</p>
            </div>
          ) : pairs.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: "rgba(255,255,255,0.03)" }}>
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
                  <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10">
                    {deleting === p.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 text-xs font-mono text-muted-foreground"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div><span className="opacity-60">From</span><br /><span className="text-white">{p.fromChainName}</span></div>
                <div><span className="opacity-60">To</span><br /><span className="text-white">{p.toChainName}</span></div>
                <div><span className="opacity-60">Min</span><br /><span className="text-white">{p.minAmount} {p.fromSymbol}</span></div>
                <div><span className="opacity-60">Max</span><br /><span className="text-white">{p.maxAmount} {p.fromSymbol}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orders tab */}
      {tab === "orders" && (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ClipboardList className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange orders yet.</p>
            </div>
          ) : orders.map(o => (
            <div key={o.id} className="rounded-xl px-4 py-3 space-y-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-[10px] font-mono text-muted-foreground truncate">{o.id.slice(0, 12)}…</code>
                  <StatusBadge status={o.status} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {new Date(o.createdAt).toLocaleString()}
                </span>
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

      {/* ── Form Modal ── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h3 className="font-bold font-mono text-white">
                {editId ? "Edit Exchange Pair" : "New Exchange Pair"}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {/* Pair name */}
              {f("name", "Pair Name", "text", "e.g. ETH → Base ETH")}

              {/* Fee & limits */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest"
                  style={{ background: "rgba(167,139,250,0.05)", color: "#a78bfa", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
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

              {/* FROM chain */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest"
                  style={{ background: "rgba(34,197,94,0.05)", color: "#22c55e", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                  From Chain (Users Send Here)
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {f("fromChainName", "Chain Name", "text", "Ethereum Mainnet")}
                    {f("fromSymbol", "Token Symbol", "text", "ETH")}
                    {f("fromChainId", "Chain ID (EVM)", "number", "1")}
                    {f("fromDepositAddress", "Deposit Address", "text", "0x... (users send ETH here)")}
                    {f("fromExplorerUrl", "Explorer URL (optional)", "text", "https://etherscan.io")}
                  </div>
                  <RpcEditor
                    label="RPC Endpoints"
                    color="#22c55e"
                    rpcList={fromRpcs}
                    setRpcList={rpcs => { setFromRpcs(rpcs); setFromHealth({}); }}
                    health={fromHealth}
                    onCheckHealth={() => checkHealth("from")}
                    checking={checkingFrom}
                    pairId={editId}
                  />
                  <LogoUploader
                    label="Chain Logo (optional)"
                    value={form.fromLogoUrl}
                    onChange={url => setForm(f => ({ ...f, fromLogoUrl: url }))}
                  />
                </div>
              </div>

              {/* TO chain */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(96,165,250,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest"
                  style={{ background: "rgba(96,165,250,0.05)", color: "#60a5fa", borderBottom: "1px solid rgba(96,165,250,0.15)" }}>
                  To Chain (Users Receive Here)
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {f("toChainName", "Chain Name", "text", "Base")}
                    {f("toSymbol", "Token Symbol", "text", "ETH")}
                    {f("toChainId", "Chain ID (EVM)", "number", "8453")}
                    {f("toExplorerUrl", "Explorer URL (optional)", "text", "https://basescan.org")}
                  </div>
                  <RpcEditor
                    label="RPC Endpoints"
                    color="#60a5fa"
                    rpcList={toRpcs}
                    setRpcList={rpcs => { setToRpcs(rpcs); setToHealth({}); }}
                    health={toHealth}
                    onCheckHealth={() => checkHealth("to")}
                    checking={checkingTo}
                    pairId={editId}
                  />
                  <LogoUploader
                    label="Chain Logo (optional)"
                    value={form.toLogoUrl}
                    onChange={url => setForm(f => ({ ...f, toLogoUrl: url }))}
                  />
                </div>
              </div>

              <div className="rounded-xl p-3 text-xs font-mono"
                style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.2)", color: "rgba(250,204,21,0.8)" }}>
                ⚠ Ensure your FAUCET_PRIVATE_KEY wallet has sufficient {form.toSymbol || "token"} balance
                on {form.toChainName || "the destination chain"} to fulfill swaps.
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
