import { useState, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/auth";
import {
  ArrowLeftRight, Plus, Trash2, Edit2, Save, X,
  AlertCircle, CheckCircle2, Loader2,
  ClipboardList, Activity, ArrowUp, ArrowDown, Upload, XCircle, RefreshCw,
  Key, Eye, EyeOff, Wallet, Settings,
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
  feePercent: string; minAmount: string; maxAmount: string;
  pairPrivateKey: string | null;
  isEnabled: boolean;
}

interface ExchangeOrder {
  id: string; pairId: number; userAddress: string;
  fromAmount: string; feeAmount: string; toAmount: string;
  status: string; fromTxHash: string | null; toTxHash: string | null;
  failReason: string | null; createdAt: string; completedAt: string | null;
}

interface ExchangeSettings {
  hasCustomKey: boolean;
  walletAddress: string | null;
}

type RpcHealth = Record<string, { status: "ok" | "error"; latencyMs: number; error?: string }>;

interface FormData {
  name: string;
  fromChainName: string; fromSymbol: string; fromChainId: number;
  fromExplorerUrl: string; fromDepositAddress: string; fromLogoUrl: string;
  toChainName: string; toSymbol: string; toChainId: number;
  toExplorerUrl: string; toLogoUrl: string;
  feePercent: string; minAmount: string; maxAmount: string; isEnabled: boolean;
  useSystemKey: boolean; pairPrivateKey: string;
}

const DEFAULT_FORM: FormData = {
  name: "", fromChainName: "", fromSymbol: "", fromChainId: 1,
  fromExplorerUrl: "", fromDepositAddress: "", fromLogoUrl: "",
  toChainName: "", toSymbol: "", toChainId: 8453,
  toExplorerUrl: "", toLogoUrl: "",
  feePercent: "1.00", minAmount: "0.001", maxAmount: "1.0", isEnabled: true,
  useSystemKey: true, pairPrivateKey: "",
};

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
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
  rpcList: string[]; setRpcList: (l: string[]) => void;
  health: RpcHealth; onCheckHealth: () => void; checking: boolean; pairId: number | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {pairId !== null && (
          <button onClick={onCheckHealth} disabled={checking}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
            {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            Health Check
          </button>
        )}
      </div>
      {rpcList.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5">
            <Input value={url} onChange={e => {
              const n = [...rpcList]; n[i] = e.target.value; setRpcList(n);
            }} placeholder="https://rpc.example.com" className="font-mono text-xs h-8 flex-1" />
            {health[url] && (
              <span className="text-[10px] font-mono shrink-0"
                style={{ color: health[url].status === "ok" ? "#22c55e" : "#f87171" }}>
                {health[url].status === "ok" ? `✓ ${health[url].latencyMs}ms` : "✗ fail"}
              </span>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            {i > 0 && (
              <button onClick={() => { const n = [...rpcList]; [n[i-1], n[i]] = [n[i], n[i-1]]; setRpcList(n); }}
                className="p-1 rounded hover:bg-white/10"><ArrowUp className="w-3 h-3 text-muted-foreground" /></button>
            )}
            {i < rpcList.length - 1 && (
              <button onClick={() => { const n = [...rpcList]; [n[i], n[i+1]] = [n[i+1], n[i]]; setRpcList(n); }}
                className="p-1 rounded hover:bg-white/10"><ArrowDown className="w-3 h-3 text-muted-foreground" /></button>
            )}
            {rpcList.length > 1 && (
              <button onClick={() => setRpcList(rpcList.filter((_, j) => j !== i))}
                className="p-1 rounded hover:bg-red-500/10"><XCircle className="w-3 h-3 text-red-400" /></button>
            )}
          </div>
        </div>
      ))}
      <button onClick={() => setRpcList([...rpcList, ""])}
        className="flex items-center gap-1 text-[10px] font-mono transition-colors hover:opacity-80"
        style={{ color }}>
        <Plus className="w-3 h-3" /> Add Fallback RPC
      </button>
    </div>
  );
}

// ── Logo uploader ─────────────────────────────────────────────────────────────
function LogoUploader({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const d = await res.json() as any;
      onChange(d.url); setFailed(false);
    } catch { onChange(""); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={e => { onChange(e.target.value); setFailed(false); }}
          placeholder="https://... or upload" className="font-mono text-xs h-8 flex-1" />
        <button onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-mono"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
        </button>
        {value && !failed && (
          <img src={value} alt="" className="w-6 h-6 rounded-full object-contain shrink-0"
            style={{ background: "rgba(255,255,255,0.1)" }} onError={() => setFailed(true)} />
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); }} />
    </div>
  );
}

// ── Pair balance chip ─────────────────────────────────────────────────────────
type BalState =
  | { kind: "loading" }
  | { kind: "rpc_error" }
  | { kind: "no_key" }
  | { kind: "ok"; bal: number }
  | { kind: "low"; bal: number }
  | { kind: "zero" };

function PairBalanceChip({ pairId, toSymbol, toChainName }: { pairId: number; toSymbol: string; toChainName: string }) {
  const [state, setState] = useState<BalState>({ kind: "loading" });

  const check = async () => {
    setState({ kind: "loading" });
    try {
      const res = await adminFetch(`/api/admin/exchange/pairs/${pairId}/wallet-balance`);
      const d = await res.json() as any;
      if (!d.address) { setState({ kind: "no_key" }); return; }
      if (d.balance === null) { setState({ kind: "rpc_error" }); return; }
      const n = parseFloat(d.balance);
      if (n === 0) setState({ kind: "zero" });
      else if (n < 0.001) setState({ kind: "low", bal: n });
      else setState({ kind: "ok", bal: n });
    } catch {
      setState({ kind: "rpc_error" });
    }
  };

  useEffect(() => { check(); }, [pairId]);

  if (state.kind === "loading") return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;

  if (state.kind === "rpc_error") return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full flex items-center gap-1"
      style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.25)" }}
      title={`Cannot reach ${toChainName} RPC — balance unverifiable. Update the To Chain RPC URL.`}>
      ⚠ RPC Error
    </span>
  );

  if (state.kind === "no_key") return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
      style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }} title="No private key configured">
      No Key
    </span>
  );

  if (state.kind === "zero") return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full flex items-center gap-1"
      style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
      title={`Exchange wallet has 0 ${toSymbol} on ${toChainName}. Swaps will fail.`}>
      ⛔ 0 {toSymbol}
    </span>
  );

  if (state.kind === "low") return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
      style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
      title={`Low balance: ${state.bal.toFixed(6)} ${toSymbol} on ${toChainName}`}>
      {state.bal.toFixed(5)} {toSymbol}
    </span>
  );

  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
      style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
      {state.bal.toFixed(4)} {toSymbol}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ExchangeManagement() {
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [settings, setSettings] = useState<ExchangeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pairs" | "orders" | "settings">("pairs");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  const [fromRpcs, setFromRpcs] = useState<string[]>([""]);
  const [toRpcs, setToRpcs] = useState<string[]>([""]);
  const [fromHealth, setFromHealth] = useState<RpcHealth>({});
  const [toHealth, setToHealth] = useState<RpcHealth>({});
  const [checkingFrom, setCheckingFrom] = useState(false);
  const [checkingTo, setCheckingTo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Settings state
  const [settingsKey, setSettingsKey] = useState("");
  const [showSettingsKey, setShowSettingsKey] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState("");

  // Per-pair key visibility in form
  const [showPairKey, setShowPairKey] = useState(false);

  const fetchPairs = async () => {
    const res = await adminFetch("/api/admin/exchange/pairs");
    if (res.ok) setPairs(await res.json());
  };
  const fetchOrders = async () => {
    const res = await adminFetch("/api/admin/exchange/orders");
    if (res.ok) setOrders(await res.json());
  };
  const fetchSettings = async () => {
    const res = await adminFetch("/api/admin/exchange/settings");
    if (res.ok) setSettings(await res.json());
  };

  useEffect(() => {
    Promise.all([fetchPairs(), fetchOrders(), fetchSettings()]).finally(() => setLoading(false));
  }, []);

  const checkHealth = async (side: "from" | "to") => {
    if (!editId) return;
    const setSide = side === "from" ? setCheckingFrom : setCheckingTo;
    const setHealth = side === "from" ? setFromHealth : setToHealth;
    setSide(true);
    try {
      const res = await adminFetch(`/api/admin/exchange/pairs/${editId}/rpc-health?side=${side}`);
      if (!res.ok) throw new Error();
      const data = await res.json() as Array<{ url: string; status: "ok" | "error"; latencyMs: number; error?: string }>;
      const map: RpcHealth = {};
      data.forEach(d => { map[d.url] = { status: d.status, latencyMs: d.latencyMs, error: d.error }; });
      setHealth(map);
    } catch { /* ignore */ }
    setSide(false);
  };

  const openCreate = () => {
    setEditId(null);
    // Auto-populate deposit address from system wallet
    const systemAddr = settings?.walletAddress ?? "";
    setForm({ ...DEFAULT_FORM, fromDepositAddress: systemAddr });
    setFromRpcs([""]); setToRpcs([""]);
    setFromHealth({}); setToHealth({});
    setShowPairKey(false);
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
      useSystemKey: !p.pairPrivateKey,
      pairPrivateKey: "",
    });
    setFromRpcs(parseRpcList(p.fromRpcUrls, p.fromRpcUrl));
    setToRpcs(parseRpcList(p.toRpcUrls, p.toRpcUrl));
    setFromHealth({}); setToHealth({});
    setShowPairKey(false);
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
        pairPrivateKey: form.useSystemKey ? null : (form.pairPrivateKey.trim() || null),
      };
      ["fromExplorerUrl","toExplorerUrl","fromLogoUrl","toLogoUrl"].forEach(k => {
        if (!body[k]) delete body[k];
      });
      const url = editId ? `/api/admin/exchange/pairs/${editId}` : "/api/admin/exchange/pairs";
      const method = editId ? "PUT" : "POST";
      const res = await adminFetch(url, { method, headers: jsonHeaders(), body: JSON.stringify(body) });
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
    await adminFetch(`/api/admin/exchange/pairs/${id}`, { method: "DELETE" });
    await fetchPairs();
    setDeleting(null);
  };

  const handleRetry = async (orderId: string) => {
    setRetrying(orderId);
    try {
      const res = await adminFetch(`/api/admin/exchange/orders/${orderId}/retry`, { method: "POST" });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error || "Retry failed");
      setSuccess("Retry started — check order status in a few seconds.");
      setTimeout(() => fetchOrders(), 4000);
      setTimeout(() => fetchOrders(), 10000);
    } catch (e: any) { setSuccess(""); setError(e.message); }
    finally { setRetrying(null); }
  };

  const handleToggle = async (p: ExchangePair) => {
    await adminFetch(`/api/admin/exchange/pairs/${p.id}`, {
      method: "PUT", headers: jsonHeaders(),
      body: JSON.stringify({ isEnabled: !p.isEnabled }),
    });
    await fetchPairs();
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true); setSettingsSuccess("");
    try {
      const res = await adminFetch("/api/admin/exchange/settings", {
        method: "PUT", headers: jsonHeaders(),
        body: JSON.stringify({ defaultPrivateKey: settingsKey }),
      });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setSettingsSuccess("Settings saved!");
      setSettingsKey("");
      setShowSettingsKey(false);
      await fetchSettings();
    } catch (e: any) { setError(e.message); }
    finally { setSavingSettings(false); }
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
        {tab === "pairs" && (
          <Button size="sm" onClick={openCreate} className="gap-1.5 font-mono">
            <Plus className="w-3.5 h-3.5" /> Add Pair
          </Button>
        )}
      </div>

      {(success || settingsSuccess) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success || settingsSuccess}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {(["pairs", "orders", "settings"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSuccess(""); setSettingsSuccess(""); setError(""); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-widest transition-colors"
            style={{
              background: tab === t ? "rgba(167,139,250,0.15)" : "transparent",
              color: tab === t ? "#a78bfa" : "rgba(255,255,255,0.4)",
            }}>
            {t === "pairs" ? <ArrowLeftRight className="w-3.5 h-3.5" />
              : t === "orders" ? <ClipboardList className="w-3.5 h-3.5" />
              : <Settings className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* ── Pairs tab ── */}
      {tab === "pairs" && (
        <div className="space-y-3">
          {pairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ArrowLeftRight className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange pairs yet. Add one to get started.</p>
            </div>
          ) : pairs.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                {/* Row 1: symbol + actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold font-mono text-sm text-white">{p.fromSymbol}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" style={{ color: "#a78bfa" }} />
                    <span className="font-bold font-mono text-sm text-white">{p.toSymbol}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate hidden sm:inline ml-1.5">{p.name}</span>
                    {p.pairPrivateKey && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>Custom Key</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                {/* Row 2: balance chip + fee */}
                <div className="flex items-center gap-2">
                  <PairBalanceChip pairId={p.id} toSymbol={p.toSymbol} toChainName={p.toChainName} />
                  <span className="text-[10px] font-mono text-muted-foreground">{p.feePercent}% fee</span>
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

      {/* ── Orders tab ── */}
      {tab === "orders" && (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <ClipboardList className="w-10 h-10 opacity-20" />
              <p className="text-sm font-mono">No exchange orders yet.</p>
            </div>
          ) : orders.map(o => (
            <div key={o.id} className="rounded-xl px-4 py-3 space-y-2"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${o.status === "failed" && o.fromTxHash ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`,
              }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-[10px] font-mono text-muted-foreground truncate">{o.id.slice(0, 12)}…</code>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</span>
                  {o.status === "failed" && o.fromTxHash && (
                    <button onClick={() => handleRetry(o.id)} disabled={retrying === o.id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-colors"
                      style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}>
                      {retrying === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Retry
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                <span className="text-white">{o.fromAmount} → {o.toAmount}</span>
                <span className="text-muted-foreground truncate">{o.userAddress.slice(0, 10)}…</span>
              </div>
              {o.failReason && (
                <div className="text-[11px] font-mono px-2 py-1.5 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.07)", color: "#f87171" }}>
                  {o.failReason}
                  {o.status === "failed" && o.fromTxHash && (
                    <span className="ml-2 opacity-60">— User funds received, toToken not sent yet</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === "settings" && (
        <div className="space-y-5">

          {/* Current wallet info */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.2)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: "rgba(167,139,250,0.05)", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
              <Wallet className="w-4 h-4" style={{ color: "#a78bfa" }} />
              <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>
                Exchange Wallet
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">Active Wallet Address</p>
                  <code className="text-sm font-mono text-white break-all">
                    {settings?.walletAddress ?? "Not configured"}
                  </code>
                </div>
                {settings?.hasCustomKey && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>Custom Key</span>
                )}
                {!settings?.hasCustomKey && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>System Key</span>
                )}
              </div>
              <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                This wallet sends tokens to users when swaps complete. It must have sufficient balance on each destination chain.
              </p>
            </div>
          </div>

          {/* Change default private key */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(250,204,21,0.2)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: "rgba(250,204,21,0.05)", borderBottom: "1px solid rgba(250,204,21,0.15)" }}>
              <Key className="w-4 h-4" style={{ color: "#facc15" }} />
              <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#facc15" }}>
                Change Default Exchange Key
              </span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                This key is used for all pairs unless a pair has its own custom key. Leave empty to use the system FAUCET_PRIVATE_KEY.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">New Default Private Key</Label>
                <div className="relative">
                  <Input
                    type={showSettingsKey ? "text" : "password"}
                    value={settingsKey}
                    onChange={e => setSettingsKey(e.target.value)}
                    placeholder="0x... (leave empty to reset to system key)"
                    className="font-mono text-xs h-9 pr-10"
                  />
                  <button type="button" onClick={() => setShowSettingsKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: "rgba(255,255,255,0.4)" }}>
                    {showSettingsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveSettings} disabled={savingSettings} size="sm" className="font-mono gap-2">
                  {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Key
                </Button>
                {settings?.hasCustomKey && (
                  <Button variant="outline" size="sm" className="font-mono text-red-400" onClick={() => {
                    setSettingsKey(""); handleSaveSettings();
                  }}>
                    Reset to System Key
                  </Button>
                )}
              </div>
              <p className="text-[10px] font-mono px-2 py-1.5 rounded-lg"
                style={{ background: "rgba(239,68,68,0.07)", color: "#f87171" }}>
                ⚠ Private keys are sensitive. Never share them. The key is stored securely in the database.
              </p>
            </div>
          </div>
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

              {/* Private Key section */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2"
                  style={{ background: "rgba(250,204,21,0.05)", color: "#facc15", borderBottom: "1px solid rgba(250,204,21,0.15)" }}>
                  <Key className="w-3.5 h-3.5" /> Private Key (for sending toToken)
                </div>
                <div className="p-4 space-y-3">
                  {/* Toggle: system vs custom */}
                  <div className="flex gap-2">
                    {[true, false].map(isSystem => (
                      <button key={String(isSystem)} onClick={() => setForm(f => ({ ...f, useSystemKey: isSystem }))}
                        className="flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all"
                        style={{
                          background: form.useSystemKey === isSystem ? (isSystem ? "rgba(34,197,94,0.1)" : "rgba(167,139,250,0.1)") : "rgba(255,255,255,0.03)",
                          border: `1px solid ${form.useSystemKey === isSystem ? (isSystem ? "rgba(34,197,94,0.3)" : "rgba(167,139,250,0.3)") : "rgba(255,255,255,0.07)"}`,
                          color: form.useSystemKey === isSystem ? (isSystem ? "#22c55e" : "#a78bfa") : "rgba(255,255,255,0.4)",
                        }}>
                        {isSystem ? "System Key" : "Custom Key"}
                      </button>
                    ))}
                  </div>
                  {form.useSystemKey ? (
                    <div className="px-3 py-2 rounded-xl text-xs font-mono"
                      style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      Uses the default exchange wallet. Address: <span className="font-bold">{settings?.walletAddress ?? "Not set"}</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Custom Private Key</Label>
                      <div className="relative">
                        <Input
                          type={showPairKey ? "text" : "password"}
                          value={form.pairPrivateKey}
                          onChange={e => setForm(f => ({ ...f, pairPrivateKey: e.target.value }))}
                          placeholder="0x... private key for this pair"
                          className="font-mono text-xs h-9 pr-10"
                        />
                        <button type="button" onClick={() => setShowPairKey(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                          style={{ color: "rgba(255,255,255,0.4)" }}>
                          {showPairKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {editId ? "Leave blank to keep the existing custom key unchanged." : "The wallet from this key will send tokens to users."}
                      </p>
                    </div>
                  )}
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
                    <div className="space-y-1.5">
                      <Label className="text-xs">Deposit Address</Label>
                      <div className="flex gap-1.5">
                        <Input
                          type="text"
                          value={form.fromDepositAddress}
                          onChange={e => setForm(f => ({ ...f, fromDepositAddress: e.target.value }))}
                          placeholder="0x... (users send ETH here)"
                          className="font-mono text-sm h-9 flex-1"
                        />
                        {settings?.walletAddress && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, fromDepositAddress: settings.walletAddress! }))}
                            className="text-[10px] font-mono px-2 rounded-lg shrink-0 transition-colors"
                            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}
                            title="Use system wallet address">
                            Use System
                          </button>
                        )}
                      </div>
                      {settings?.walletAddress && (
                        <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                          System wallet: {settings.walletAddress.slice(0, 10)}…{settings.walletAddress.slice(-6)}
                        </p>
                      )}
                    </div>
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
