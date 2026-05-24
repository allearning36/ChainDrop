import { useState, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/auth";
import {
  Database, Plus, Edit2, Trash2, Search, X, Loader2, AlertCircle,
  ArrowUp, ArrowDown, Save, Upload, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MasterChain } from "./ChainSelector";

const DEFAULT_FORM = {
  name: "", symbol: "", chainId: "", chainType: "evm",
  logoUrl: "", rpcUrls: [""], explorerUrls: [""], isTestnet: true,
};

const CHAIN_TYPE_OPTIONS = [
  { value: "evm", label: "EVM (Ethereum, BSC, Polygon…)" },
  { value: "solana", label: "Solana" },
  { value: "ton", label: "TON" },
  { value: "sui", label: "Sui" },
  { value: "aptos", label: "Aptos" },
];

export function ChainLibrary() {
  const [chains, setChains] = useState<MasterChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [populating, setPopulating] = useState(false);
  const [popResult, setPopResult] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [rpcHealth, setRpcHealth] = useState<Record<string, { status: "ok" | "error"; latencyMs: number }>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);

  const handleCheckHealth = async () => {
    if (!editId) return;
    setCheckingHealth(true);
    setRpcHealth({});
    try {
      const res = await adminFetch(`/api/admin/master-chains/${editId}/rpc-health`);
      if (!res.ok) throw new Error();
      const data = await res.json() as Array<{ url: string; status: "ok" | "error"; latencyMs: number }>;
      const map: Record<string, { status: "ok" | "error"; latencyMs: number }> = {};
      for (const d of data) map[d.url] = d;
      setRpcHealth(map);
    } catch {
      setError("RPC health check failed.");
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const d = await res.json() as { url: string };
      setForm(f => ({ ...f, logoUrl: d.url }));
    } catch {
      setError("Logo upload failed. Try pasting a URL instead.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const fetchChains = async () => {
    const res = await adminFetch("/api/admin/master-chains");
    if (res.ok) setChains(await res.json());
  };

  useEffect(() => { fetchChains().finally(() => setLoading(false)); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...DEFAULT_FORM });
    setError("");
    setFormOpen(true);
  };

  const openEdit = (c: MasterChain) => {
    setEditId(c.id);
    setForm({
      name: c.name, symbol: c.symbol,
      chainId: c.chainId != null ? String(c.chainId) : "",
      chainType: c.chainType,
      logoUrl: c.logoUrl ?? "",
      rpcUrls: c.rpcUrls.length > 0 ? c.rpcUrls : [""],
      explorerUrls: c.explorerUrls.length > 0 ? c.explorerUrls : [""],
      isTestnet: c.isTestnet,
    });
    setError("");
    setFormOpen(true);
  };

  const handleSave = async () => {
    const validRpcs = form.rpcUrls.filter(u => u.trim());
    if (!form.name.trim() || !form.symbol.trim() || validRpcs.length === 0) {
      setError("Chain name, symbol, and at least one RPC URL are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        chainId: form.chainId ? Number(form.chainId) : null,
        chainType: form.chainType,
        logoUrl: form.logoUrl.trim() || null,
        rpcUrls: validRpcs,
        explorerUrls: form.explorerUrls.filter(u => u.trim()),
        isTestnet: form.isTestnet,
      };
      const url = editId ? `/api/admin/master-chains/${editId}` : "/api/admin/master-chains";
      const method = editId ? "PATCH" : "POST";
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error || "Save failed"); }
      await fetchChains();
      setFormOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" from Chain Library?\n\nThis won't affect existing faucet chains or exchange pairs.`)) return;
    setDeleting(id);
    await adminFetch(`/api/admin/master-chains/${id}`, { method: "DELETE" });
    await fetchChains();
    setDeleting(null);
  };

  const handlePopulate = async () => {
    setPopulating(true);
    setPopResult("");
    try {
      const res = await adminFetch("/api/admin/master-chains/populate", { method: "POST" });
      const d = await res.json() as { added?: number };
      setPopResult(`Done! Added ${d.added ?? 0} chain(s) from existing faucet chains and exchange pairs.`);
      await fetchChains();
    } catch {
      setPopResult("Auto-import failed.");
    } finally {
      setPopulating(false);
    }
  };

  const setRpcUrl = (i: number, val: string) => {
    const n = [...form.rpcUrls]; n[i] = val; setForm(f => ({ ...f, rpcUrls: n }));
  };
  const moveRpc = (i: number, dir: -1 | 1) => {
    const n = [...form.rpcUrls]; [n[i], n[i + dir]] = [n[i + dir]!, n[i]!];
    setForm(f => ({ ...f, rpcUrls: n }));
  };
  const setExplorerUrl = (i: number, val: string) => {
    const n = [...form.explorerUrls]; n[i] = val; setForm(f => ({ ...f, explorerUrls: n }));
  };

  const filtered = chains.filter(c => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || String(c.chainId ?? "").includes(q);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm font-mono">Loading chain library…</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold font-mono flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: "#a78bfa" }} /> Chain Library
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Master chain list — select from here when adding faucet chains or exchange pairs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePopulate} disabled={populating}
            className="font-mono text-xs gap-1.5">
            {populating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            Auto-Import
          </Button>
          <Button size="sm" onClick={openCreate} className="font-mono gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Chain
          </Button>
        </div>
      </div>

      {popResult && (
        <div className="px-3 py-2 rounded-xl text-xs font-mono"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
          {popResult}
        </div>
      )}

      {chains.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, symbol or chain ID…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm font-mono border focus:outline-none"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", color: "#fff" }}
          />
        </div>
      )}

      {chains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground rounded-xl"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
          <Database className="w-10 h-10 opacity-20" />
          <p className="text-sm font-mono">No chains in library yet.</p>
          <p className="text-xs font-mono opacity-60 text-center px-4">
            Click "Auto-Import" to import from existing faucet chains &amp; exchange pairs, or add manually.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {c.logoUrl ? (
                <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-full object-contain shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                  {c.symbol.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-white">{c.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{
                      background: c.isTestnet ? "rgba(250,204,21,0.12)" : "rgba(34,197,94,0.12)",
                      color: c.isTestnet ? "#facc15" : "#22c55e",
                    }}>
                    {c.isTestnet ? "Testnet" : "Mainnet"}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    {c.chainType.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs font-mono text-muted-foreground flex-wrap">
                  <span>{c.symbol}</span>
                  {c.chainId != null && <span>ID: {c.chainId}</span>}
                  <span>{c.rpcUrls.length} RPC{c.rpcUrls.length !== 1 ? "s" : ""}</span>
                  {c.explorerUrls.length > 0 && (
                    <span>{c.explorerUrls.length} Explorer{c.explorerUrls.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-white/10">
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(c.id, c.name)} disabled={deleting === c.id}
                  className="p-1.5 rounded-lg hover:bg-red-500/10">
                  {deleting === c.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                    : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && search && (
            <p className="text-center text-sm font-mono text-muted-foreground py-8">No chains match your search.</p>
          )}
        </div>
      )}

      {/* Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h3 className="font-bold font-mono text-white">
                {editId ? "Edit Chain" : "Add Chain to Library"}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {/* Identity */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.2)" }}>
                <div className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest"
                  style={{ background: "rgba(167,139,250,0.05)", color: "#a78bfa", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
                  Chain Identity
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Chain Name <span className="text-destructive">*</span></Label>
                      <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ethereum Sepolia" className="font-mono text-sm h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Symbol <span className="text-destructive">*</span></Label>
                      <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                        placeholder="ETH" className="font-mono text-sm h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Chain ID</Label>
                      <Input type="number" value={form.chainId}
                        onChange={e => setForm(f => ({ ...f, chainId: e.target.value }))}
                        placeholder="11155111" className="font-mono text-sm h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Chain Type</Label>
                      <select value={form.chainType} onChange={e => setForm(f => ({ ...f, chainType: e.target.value }))}
                        className="w-full h-9 rounded-md border px-3 text-sm font-mono bg-transparent"
                        style={{ borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "rgba(255,255,255,0.04)" }}>
                        {CHAIN_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value} style={{ background: "#0d1117" }}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Logo URL</Label>
                      <div className="flex items-center gap-2">
                        <Input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                          placeholder="https://…" className="font-mono text-xs h-9 flex-1" />
                        <button
                          type="button"
                          onClick={() => logoFileRef.current?.click()}
                          disabled={uploadingLogo}
                          className="flex items-center gap-1 px-2.5 h-9 rounded-lg text-[11px] font-mono shrink-0 transition-colors"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                        >
                          {uploadingLogo
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Upload className="w-3.5 h-3.5" />}
                          Upload
                        </button>
                        {form.logoUrl && (
                          <img src={form.logoUrl} alt="" className="w-8 h-8 rounded-full object-contain shrink-0"
                            style={{ background: "rgba(255,255,255,0.08)" }}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                      </div>
                      <input
                        ref={logoFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }}
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-5">
                      <Switch checked={form.isTestnet} onCheckedChange={c => setForm(f => ({ ...f, isTestnet: c }))} />
                      <Label className="text-xs cursor-pointer">{form.isTestnet ? "Testnet" : "Mainnet"}</Label>
                    </div>
                  </div>
                </div>
              </div>

              {/* RPC URLs */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="px-4 py-2 flex items-center justify-between"
                  style={{ background: "rgba(34,197,94,0.05)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#22c55e" }}>
                    RPC Endpoints <span className="text-destructive">*</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {editId && (
                      <button
                        type="button"
                        onClick={handleCheckHealth}
                        disabled={checkingHealth}
                        className="text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors"
                        style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}
                      >
                        {checkingHealth
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Activity className="w-3 h-3" />}
                        {checkingHealth ? "Checking…" : "Check RPC"}
                      </button>
                    )}
                    <button onClick={() => setForm(f => ({ ...f, rpcUrls: [...f.rpcUrls, ""] }))}
                      className="text-[10px] font-mono flex items-center gap-1" style={{ color: "#22c55e" }}>
                      <Plus className="w-3 h-3" /> Add RPC
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {form.rpcUrls.map((url, i) => {
                    const h = rpcHealth[url];
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 text-right">
                          {i === 0 ? "Primary" : `Fallback ${i}`}
                        </span>
                        <Input value={url} onChange={e => { setRpcUrl(i, e.target.value); setRpcHealth({}); }}
                          placeholder="https://rpc.example.com" className="font-mono text-xs h-8 flex-1" />
                        {h && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: h.status === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                              color: h.status === "ok" ? "#22c55e" : "#f87171",
                            }}
                          >
                            {h.status === "ok" ? `✓ ${h.latencyMs}ms` : "✗ Down"}
                          </span>
                        )}
                        <div className="flex gap-0.5 shrink-0">
                          {i > 0 && (
                            <button onClick={() => moveRpc(i, -1)} className="p-1 rounded hover:bg-white/10">
                              <ArrowUp className="w-3 h-3 text-muted-foreground" />
                            </button>
                          )}
                          {i < form.rpcUrls.length - 1 && (
                            <button onClick={() => moveRpc(i, 1)} className="p-1 rounded hover:bg-white/10">
                              <ArrowDown className="w-3 h-3 text-muted-foreground" />
                            </button>
                          )}
                          {form.rpcUrls.length > 1 && (
                            <button onClick={() => setForm(f => ({ ...f, rpcUrls: f.rpcUrls.filter((_, j) => j !== i) }))}
                              className="p-1 rounded hover:bg-red-500/10">
                              <X className="w-3 h-3 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explorer URLs */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(96,165,250,0.2)" }}>
                <div className="px-4 py-2 flex items-center justify-between"
                  style={{ background: "rgba(96,165,250,0.05)", borderBottom: "1px solid rgba(96,165,250,0.15)" }}>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#60a5fa" }}>
                    Explorer URLs
                  </span>
                  <button onClick={() => setForm(f => ({ ...f, explorerUrls: [...f.explorerUrls, ""] }))}
                    className="text-[10px] font-mono flex items-center gap-1" style={{ color: "#60a5fa" }}>
                    <Plus className="w-3 h-3" /> Add Explorer
                  </button>
                </div>
                <div className="p-4 space-y-2">
                  {form.explorerUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input value={url} onChange={e => setExplorerUrl(i, e.target.value)}
                        placeholder="https://etherscan.io" className="font-mono text-xs h-8 flex-1" />
                      {form.explorerUrls.length > 1 && (
                        <button onClick={() => setForm(f => ({ ...f, explorerUrls: f.explorerUrls.filter((_, j) => j !== i) }))}
                          className="p-1 rounded hover:bg-red-500/10 shrink-0">
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1 font-mono">Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 font-mono gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editId ? "Update" : "Add"} Chain
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
