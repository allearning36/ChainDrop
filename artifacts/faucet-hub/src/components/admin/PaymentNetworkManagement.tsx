import { useState, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/auth";
import { Plus, Trash2, Edit2, Loader2, AlertCircle, CheckCircle2, X, Network, Upload, RefreshCw, ExternalLink, Coins, ChevronDown, ChevronUp, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChainSelector, type MasterChain } from "./ChainSelector";

interface PaymentNetwork {
  id: number;
  networkId: string;
  name: string;
  symbol: string;
  chainId: number;
  rpcUrl: string;
  rpcUrls: string;
  blockExplorerUrl: string | null;
  isToken: boolean;
  contractAddress: string | null;
  tokenDecimals: number;
  logoUrl: string | null;
  isEnabled: boolean;
  createdAt: string;
}

interface RpcHealth { url: string; status: "ok" | "error"; latencyMs: number; error?: string | null; }

function parseRpcUrls(json: string): string[] {
  try { return JSON.parse(json || "[]"); } catch { return []; }
}

const emptyForm = {
  networkId: "",
  name: "",
  symbol: "ETH",
  chainId: "",
  rpcUrl: "",
  rpcUrls: [] as string[],
  blockExplorerUrl: "",
  isToken: false,
  contractAddress: "",
  tokenDecimals: "18",
  logoUrl: "",
  isEnabled: true,
};

export function PaymentNetworkManagement() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [networks, setNetworks] = useState<PaymentNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<number, RpcHealth[] | "loading">>({});
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [librarySelectorOpen, setLibrarySelectorOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await adminFetch("/api/admin/payment-networks");
      if (!res.ok) throw new Error();
      setNetworks(await res.json() as PaymentNetwork[]);
    } catch { setError("Failed to load payment networks"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError("");
    setFormOpen(true);
  }

  function openAddFromLibrary() {
    setLibrarySelectorOpen(true);
  }

  function handleLibrarySelect(chain: MasterChain) {
    setLibrarySelectorOpen(false);
    setEditingId(null);
    const suggestedId = (chain.name + "_" + chain.symbol).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    setForm({
      networkId: suggestedId,
      name: chain.name,
      symbol: chain.symbol,
      chainId: chain.chainId != null ? String(chain.chainId) : "",
      rpcUrl: chain.rpcUrls[0] ?? "",
      rpcUrls: chain.rpcUrls.slice(1),
      blockExplorerUrl: chain.explorerUrls[0] ?? "",
      isToken: false,
      contractAddress: "",
      tokenDecimals: "18",
      logoUrl: chain.logoUrl ?? "",
      isEnabled: true,
    });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(n: PaymentNetwork) {
    setEditingId(n.id);
    setForm({
      networkId: n.networkId,
      name: n.name,
      symbol: n.symbol,
      chainId: String(n.chainId),
      rpcUrl: n.rpcUrl,
      rpcUrls: parseRpcUrls(n.rpcUrls),
      blockExplorerUrl: n.blockExplorerUrl ?? "",
      isToken: n.isToken,
      contractAddress: n.contractAddress ?? "",
      tokenDecimals: String(n.tokenDecimals),
      logoUrl: n.logoUrl ?? "",
      isEnabled: n.isEnabled,
    });
    setFormError("");
    setFormOpen(true);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      setForm(f => ({ ...f, logoUrl: url }));
      toast({ title: "Uploaded", description: "Logo uploaded successfully." });
    } catch { toast({ variant: "destructive", title: "Upload failed" }); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  function addRpcUrl() { setForm(f => ({ ...f, rpcUrls: [...f.rpcUrls, ""] })); }
  function updateRpcUrl(i: number, v: string) { setForm(f => { const arr = [...f.rpcUrls]; arr[i] = v; return { ...f, rpcUrls: arr }; }); }
  function removeRpcUrl(i: number) { setForm(f => ({ ...f, rpcUrls: f.rpcUrls.filter((_, j) => j !== i) })); }

  async function handleSave() {
    if (!form.networkId.trim() || !form.name.trim() || !form.chainId || !form.rpcUrl.trim()) {
      setFormError("Network ID, Name, Chain ID, and Primary RPC URL are required.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.networkId)) {
      setFormError("Network ID must be lowercase letters, numbers, and underscores only.");
      return;
    }
    if (form.isToken && !form.contractAddress.trim()) {
      setFormError("Token mode requires a Contract Address.");
      return;
    }
    setSaving(true); setFormError("");
    try {
      const body = {
        networkId: form.networkId,
        name: form.name,
        symbol: form.symbol || "ETH",
        chainId: Number(form.chainId),
        rpcUrl: form.rpcUrl,
        rpcUrls: form.rpcUrls.filter(u => u.trim()),
        blockExplorerUrl: form.blockExplorerUrl || null,
        isToken: form.isToken,
        contractAddress: form.isToken ? (form.contractAddress || null) : null,
        tokenDecimals: Number(form.tokenDecimals) || 18,
        logoUrl: form.logoUrl || null,
        isEnabled: form.isEnabled,
      };
      const url = editingId ? `/api/admin/payment-networks/${editingId}` : "/api/admin/payment-networks";
      const method = editingId ? "PATCH" : "POST";
      const res = await adminFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json() as { error?: string }; setFormError(d.error ?? "Save failed"); return; }
      toast({ title: editingId ? "Network updated" : "Network created", description: form.name });
      setFormOpen(false); load();
    } catch { setFormError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/payment-networks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Network deleted" }); load();
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
    finally { setDeletingId(null); }
  }

  async function toggleEnabled(n: PaymentNetwork) {
    try {
      await adminFetch(`/api/admin/payment-networks/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isEnabled: !n.isEnabled }) });
      load();
    } catch { toast({ title: "Failed to toggle", variant: "destructive" }); }
  }

  async function checkHealth(n: PaymentNetwork) {
    setHealthResults(h => ({ ...h, [n.id]: "loading" }));
    try {
      const res = await adminFetch(`/api/admin/payment-networks/${n.id}/rpc-health`);
      if (!res.ok) throw new Error();
      const data = await res.json() as RpcHealth[];
      setHealthResults(h => ({ ...h, [n.id]: data }));
    } catch { setHealthResults(h => ({ ...h, [n.id]: [{ url: n.rpcUrl, status: "error", latencyMs: 0, error: "Request failed" }] })); }
  }

  function toggleExpand(id: number) {
    setExpandedRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleUpload} />

      <ChainSelector
        open={librarySelectorOpen}
        onClose={() => setLibrarySelectorOpen(false)}
        onSelect={handleLibrarySelect}
        title="Import Chain as Payment Network"
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" /> Buy Payment Networks
          </h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            Networks users can pay from to receive testnet tokens (ETH, BNB, AVAX, USDT, USDC, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openAddFromLibrary} className="gap-1 font-mono text-xs h-8">
            <Library className="w-3.5 h-3.5" /> Import from Library
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-1 font-mono text-xs h-8">
            <Plus className="w-3.5 h-3.5" /> Add Network
          </Button>
        </div>
      </div>

      {/* Form */}
      {formOpen && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.04)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(99,102,241,0.15)" }}>
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-primary">
              {editingId ? "Edit Network" : "Add Network"}
            </span>
            <button onClick={() => setFormOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="p-4 space-y-4">

            {/* Token mode toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: form.isToken ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${form.isToken ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.08)"}` }}>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4" style={{ color: form.isToken ? "#eab308" : "rgba(255,255,255,0.4)" }} />
                <div>
                  <p className="text-xs font-mono font-semibold">{form.isToken ? "TOKEN MODE (ERC-20 / BEP-20)" : "CHAIN MODE (Native coin)"}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{form.isToken ? "Contract Address + Decimals required" : "Native coin — no contract needed"}</p>
                </div>
              </div>
              <Switch checked={form.isToken} onCheckedChange={v => setForm(f => ({ ...f, isToken: v }))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Network ID */}
              <div className="space-y-1.5">
                <Label className="text-xs">Network ID <span className="text-muted-foreground font-normal">(unique key, e.g. "bnb")</span></Label>
                <Input value={form.networkId} onChange={e => setForm(f => ({ ...f, networkId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  className="font-mono text-sm h-9" placeholder="bnb" disabled={!!editingId} />
                <p className="text-[10px] text-muted-foreground font-mono">Lowercase + underscores. Cannot change after creation.</p>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs">Display Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="font-mono text-sm h-9" placeholder="BNB Smart Chain" />
              </div>

              {/* Symbol */}
              <div className="space-y-1.5">
                <Label className="text-xs">Symbol</Label>
                <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  className="font-mono text-sm h-9" placeholder="BNB" />
              </div>

              {/* Chain ID */}
              <div className="space-y-1.5">
                <Label className="text-xs">Chain ID</Label>
                <Input type="number" value={form.chainId} onChange={e => setForm(f => ({ ...f, chainId: e.target.value }))}
                  className="font-mono text-sm h-9" placeholder="56" />
              </div>

              {/* Token fields (only when isToken) */}
              {form.isToken && (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Contract Address <span className="text-red-400 font-normal">*required for token</span></Label>
                    <Input value={form.contractAddress} onChange={e => setForm(f => ({ ...f, contractAddress: e.target.value }))}
                      className="font-mono text-sm h-9" placeholder="0x55d398326f99059fF775485246999027B3197955" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Token Decimals</Label>
                    <Input type="number" value={form.tokenDecimals} onChange={e => setForm(f => ({ ...f, tokenDecimals: e.target.value }))}
                      className="font-mono text-sm h-9" placeholder="18" />
                    <p className="text-[10px] text-muted-foreground font-mono">USDT/USDC = 6, most ERC-20 = 18</p>
                  </div>
                </>
              )}

              {/* Primary RPC */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Primary RPC URL <span className="text-red-400 font-normal">*required</span></Label>
                <Input value={form.rpcUrl} onChange={e => setForm(f => ({ ...f, rpcUrl: e.target.value }))}
                  className="font-mono text-sm h-9" placeholder="https://bsc-dataseed.binance.org/" />
                <p className="text-[10px] text-muted-foreground font-mono">Main RPC — used first. Add fallbacks below.</p>
              </div>

              {/* Fallback RPCs */}
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Fallback RPC URLs <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <button type="button" onClick={addRpcUrl} className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Fallback
                  </button>
                </div>
                {form.rpcUrls.length === 0 && (
                  <p className="text-[10px] text-muted-foreground font-mono">No fallback RPCs. If primary fails, requests will error.</p>
                )}
                {form.rpcUrls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={url} onChange={e => updateRpcUrl(i, e.target.value)}
                      className="font-mono text-sm h-9" placeholder={`Fallback RPC #${i + 1}`} />
                    <button type="button" onClick={() => removeRpcUrl(i)} className="p-2 text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Block Explorer */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Block Explorer URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.blockExplorerUrl} onChange={e => setForm(f => ({ ...f, blockExplorerUrl: e.target.value }))}
                  className="font-mono text-sm h-9" placeholder="https://bscscan.com" />
                <p className="text-[10px] text-muted-foreground font-mono">Used to link to transaction confirmations.</p>
              </div>

              {/* Logo */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Logo <span className="text-muted-foreground font-normal">(URL or upload)</span></Label>
                <div className="flex gap-2 items-center">
                  {form.logoUrl && (
                    <img src={form.logoUrl} alt="logo" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />
                  )}
                  <Input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                    className="font-mono text-sm h-9" placeholder="https://... or upload" />
                  <Button type="button" variant="outline" size="sm" className="shrink-0 h-9 gap-1" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span className="text-xs">Upload</span>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Recommended: 64×64px, square. PNG / SVG / WebP.</p>
              </div>

              {/* Enabled */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.isEnabled} onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))} />
                  <Label className="text-xs">{form.isEnabled ? "Enabled" : "Disabled"}</Label>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground pl-0.5">
                  {form.isEnabled
                    ? "Network is active — users will see it as a payment option."
                    : "Network is hidden — save it now and enable it later when ready."}
                </p>
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 text-xs font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {formError}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1 font-mono text-xs">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {saving ? "Saving..." : "Save Network"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} className="font-mono text-xs">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm font-mono text-destructive px-4 py-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : networks.length === 0 ? (
        <div className="text-center py-12 space-y-3 text-xs font-mono text-muted-foreground">
          <Network className="w-10 h-10 mx-auto opacity-20" />
          <p>No payment networks yet.</p>
          <p className="opacity-60">Click <span className="text-primary">"Import from Library"</span> to add ETH, BASE, BNB, etc. from your Chain Library,<br />or use <span className="text-primary">"Add Network"</span> to configure manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {networks.map(n => {
            const expanded = expandedRows.has(n.id);
            const health = healthResults[n.id];
            const extras = parseRpcUrls(n.rpcUrls);
            return (
              <div key={n.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {n.logoUrl
                    ? <img src={n.logoUrl} alt={n.symbol} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold font-mono" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>{n.symbol.slice(0, 2)}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-foreground">{n.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{n.networkId}</Badge>
                      {n.isToken && <Badge className="font-mono text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">TOKEN</Badge>}
                      <span className="text-[10px] font-mono text-muted-foreground">Chain {n.chainId}</span>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                      {n.contractAddress ? `Contract: ${n.contractAddress.slice(0,10)}...` : `Native ${n.symbol}`}
                      {extras.length > 0 && ` · ${extras.length + 1} RPCs`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={n.isEnabled} onCheckedChange={() => toggleEnabled(n)} />
                    <button onClick={() => checkHealth(n)} title="Check RPC health"
                      className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-primary">
                      {health === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </button>
                    {n.blockExplorerUrl && (
                      <a href={n.blockExplorerUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => openEdit(n)} className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(n.id)} disabled={deletingId === n.id}
                      className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                      {deletingId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => toggleExpand(n.id)} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground">
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details + health */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div><span className="text-muted-foreground">Primary RPC:</span> <span className="text-foreground break-all">{n.rpcUrl}</span></div>
                      {extras.map((u, i) => <div key={i}><span className="text-muted-foreground">Fallback {i + 1}:</span> <span className="text-foreground break-all">{u}</span></div>)}
                      {n.blockExplorerUrl && <div><span className="text-muted-foreground">Explorer:</span> <span className="text-primary">{n.blockExplorerUrl}</span></div>}
                      {n.contractAddress && <div className="sm:col-span-2"><span className="text-muted-foreground">Contract:</span> <span className="text-foreground font-mono break-all">{n.contractAddress}</span></div>}
                    </div>

                    {/* RPC Health results */}
                    {health && health !== "loading" && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">RPC Health</p>
                        {health.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono"
                            style={{ background: r.status === "ok" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${r.status === "ok" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.status === "ok" ? "#22c55e" : "#ef4444" }} />
                            <span className="text-muted-foreground truncate flex-1">{r.url}</span>
                            {r.status === "ok"
                              ? <span style={{ color: "#22c55e" }}>{r.latencyMs}ms</span>
                              : <span style={{ color: "#f87171" }}>{r.error ?? "error"}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {health === "loading" && (
                      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking RPC health...
                      </div>
                    )}
                    {!health && (
                      <button onClick={() => checkHealth(n)} className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Check RPC health
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl px-4 py-3 text-xs font-mono space-y-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-foreground font-semibold">How to use:</p>
        <ol className="text-muted-foreground space-y-0.5 list-decimal list-inside">
          <li>Add a chain/network here — use <strong>"Import from Library"</strong> to auto-fill from Chain Library, or add manually</li>
          <li>Go to Chains → Edit a chain → Buy Settings → Payment Networks</li>
          <li>The network ID will appear as a checkbox — enable it and save</li>
        </ol>
        <p className="text-muted-foreground mt-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          Token mode (ERC-20/BEP-20): requires Contract Address + Decimals. For USDT use decimals=6, for most tokens use 18.
        </p>
      </div>
    </div>
  );
}
