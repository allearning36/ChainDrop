import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/auth";
import { Plus, Trash2, Edit2, Loader2, AlertCircle, CheckCircle2, X, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface PaymentNetwork {
  id: number;
  networkId: string;
  name: string;
  symbol: string;
  chainId: number;
  rpcUrl: string;
  contractAddress: string | null;
  tokenDecimals: number;
  logoUrl: string | null;
  isEnabled: boolean;
  createdAt: string;
}

const BUILTIN_NETWORKS = ["eth", "base", "arbitrum", "optimism", "polygon"];

const emptyForm = {
  networkId: "",
  name: "",
  symbol: "ETH",
  chainId: "",
  rpcUrl: "",
  contractAddress: "",
  tokenDecimals: "18",
  logoUrl: "",
  isEnabled: true,
};

export function PaymentNetworkManagement() {
  const { toast } = useToast();
  const [networks, setNetworks] = useState<PaymentNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/payment-networks");
      if (!res.ok) throw new Error("Failed to load");
      setNetworks(await res.json() as PaymentNetwork[]);
    } catch {
      setError("Failed to load payment networks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
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
      contractAddress: n.contractAddress ?? "",
      tokenDecimals: String(n.tokenDecimals),
      logoUrl: n.logoUrl ?? "",
      isEnabled: n.isEnabled,
    });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.networkId.trim() || !form.name.trim() || !form.chainId || !form.rpcUrl.trim()) {
      setFormError("Network ID, Name, Chain ID, and RPC URL are required.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.networkId)) {
      setFormError("Network ID must be lowercase letters, numbers, and underscores only.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const body = {
        networkId: form.networkId,
        name: form.name,
        symbol: form.symbol || "ETH",
        chainId: Number(form.chainId),
        rpcUrl: form.rpcUrl,
        contractAddress: form.contractAddress || null,
        tokenDecimals: Number(form.tokenDecimals) || 18,
        logoUrl: form.logoUrl || null,
        isEnabled: form.isEnabled,
      };
      const url = editingId ? `/api/admin/payment-networks/${editingId}` : "/api/admin/payment-networks";
      const method = editingId ? "PATCH" : "POST";
      const res = await adminFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? "Save failed");
        return;
      }
      toast({ title: editingId ? "Network updated" : "Network created", description: form.name });
      setFormOpen(false);
      load();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/payment-networks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Network deleted" });
      load();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleEnabled(n: PaymentNetwork) {
    try {
      await adminFetch(`/api/admin/payment-networks/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !n.isEnabled }),
      });
      load();
    } catch {
      toast({ title: "Failed to toggle", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" /> Buy Payment Networks
          </h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            Custom chains for accepting payment (BNB, AVAX, etc.). Built-in: ETH, Base, Arbitrum, Optimism, Polygon.
          </p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1 font-mono text-xs h-8">
          <Plus className="w-3.5 h-3.5" /> Add Network
        </Button>
      </div>

      {/* Built-in network info */}
      <div className="rounded-xl px-4 py-3 text-xs font-mono" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <p className="text-primary font-semibold mb-1.5">Built-in networks (always available)</p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_NETWORKS.map(id => (
            <Badge key={id} variant="outline" className="font-mono text-[10px] uppercase">{id}</Badge>
          ))}
        </div>
        <p className="text-muted-foreground mt-2">Enable these in each chain's Buy Settings → Payment Networks checkboxes. Add custom networks below.</p>
      </div>

      {/* Form */}
      {formOpen && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.04)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(99,102,241,0.15)" }}>
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-primary">
              {editingId ? "Edit Network" : "Add New Network"}
            </span>
            <button onClick={() => setFormOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Network ID <span className="text-muted-foreground font-normal">(unique key, e.g. "bnb")</span></Label>
              <Input value={form.networkId} onChange={e => setForm({...form, networkId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")})}
                className="font-mono text-sm h-9" placeholder="bnb" disabled={!!editingId} />
              <p className="text-[10px] text-muted-foreground font-mono">Lowercase letters, numbers, underscores. Cannot be changed after creation.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="font-mono text-sm h-9" placeholder="BNB Smart Chain" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Native Symbol</Label>
              <Input value={form.symbol} onChange={e => setForm({...form, symbol: e.target.value.toUpperCase()})}
                className="font-mono text-sm h-9" placeholder="BNB" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chain ID</Label>
              <Input type="number" value={form.chainId} onChange={e => setForm({...form, chainId: e.target.value})}
                className="font-mono text-sm h-9" placeholder="56" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">RPC URL</Label>
              <Input value={form.rpcUrl} onChange={e => setForm({...form, rpcUrl: e.target.value})}
                className="font-mono text-sm h-9" placeholder="https://bsc-dataseed.binance.org/" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Token Contract Address <span className="text-muted-foreground font-normal">(optional — leave blank for native token like BNB/AVAX; set for ERC-20 like USDT/USDC)</span></Label>
              <Input value={form.contractAddress} onChange={e => setForm({...form, contractAddress: e.target.value})}
                className="font-mono text-sm h-9" placeholder="0x... (ERC-20 contract address, or leave blank for native)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Token Decimals</Label>
              <Input type="number" value={form.tokenDecimals} onChange={e => setForm({...form, tokenDecimals: e.target.value})}
                className="font-mono text-sm h-9" placeholder="18" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={form.logoUrl} onChange={e => setForm({...form, logoUrl: e.target.value})}
                className="font-mono text-sm h-9" placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={form.isEnabled} onCheckedChange={v => setForm({...form, isEnabled: v})} />
              <Label className="text-xs">{form.isEnabled ? "Enabled" : "Disabled"}</Label>
            </div>
          </div>
          {formError && (
            <div className="mx-4 mb-3 flex items-start gap-2 text-xs font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {formError}
            </div>
          )}
          <div className="px-4 pb-4 flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1 font-mono text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : "Save Network"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} className="font-mono text-xs">Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm font-mono text-destructive px-4 py-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : networks.length === 0 ? (
        <div className="text-center py-12 text-xs font-mono text-muted-foreground">
          No custom networks yet. Add one to accept payment via BNB, AVAX, USDT, USDC, etc.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-border">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal">Network ID</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal">Name</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal hidden sm:table-cell">Symbol</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal hidden md:table-cell">Chain ID</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal hidden lg:table-cell">Contract</th>
                <th className="text-center px-4 py-2.5 text-muted-foreground font-normal">Enabled</th>
                <th className="text-right px-4 py-2.5 text-muted-foreground font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n, i) => (
                <tr key={n.id} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {n.logoUrl && <img src={n.logoUrl} alt={n.symbol} className="w-5 h-5 rounded-full object-cover" />}
                      <Badge variant="outline" className="font-mono text-[10px]">{n.networkId}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{n.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{n.symbol}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{n.chainId}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {n.contractAddress
                      ? <span className="text-primary">{n.contractAddress.slice(0, 8)}...{n.contractAddress.slice(-6)}</span>
                      : <span className="text-muted-foreground">Native</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch checked={n.isEnabled} onCheckedChange={() => toggleEnabled(n)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(n)} className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(n.id)} disabled={deletingId === n.id}
                        className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                        {deletingId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl px-4 py-3 text-xs font-mono space-y-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-foreground font-semibold">How to use custom networks:</p>
        <ol className="text-muted-foreground space-y-0.5 list-decimal list-inside">
          <li>Add a custom network here (e.g., networkId: "bnb")</li>
          <li>Go to Chains → Edit a chain → Buy Settings</li>
          <li>In "Payment Networks", the new ID will appear as a checkbox</li>
          <li>Enable it and save the chain</li>
        </ol>
        <p className="text-muted-foreground mt-1">ERC-20 token support (USDT/USDC) requires contract address. Full ERC-20 transfer verification is coming soon — currently only native token transfers are verified on-chain.</p>
      </div>
    </div>
  );
}
