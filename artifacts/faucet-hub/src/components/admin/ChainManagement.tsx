import { useState, useRef, useMemo } from "react";
import { 
  useGetAdminChains, 
  useCreateChain, 
  useUpdateChain, 
  useDeleteChain,
  getGetAdminChainsQueryKey,
  ChainAdmin
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit2, Plus, Trash2, Loader2, AlertCircle, Upload, X, ShoppingCart, Pin, PinOff, Server, Shield, Droplets, Globe, Settings2, Clock, ArrowUp, ArrowDown, Activity, CheckCircle2, XCircle, RefreshCw, Tv2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/auth";
import { formatCooldown, secondsToHms, hmsToSeconds } from "@/lib/utils";

const ALL_PAYMENT_NETWORKS = [
  { id: "eth",      name: "Ethereum Mainnet", chainId: 1 },
  { id: "base",     name: "Base",             chainId: 8453 },
  { id: "arbitrum", name: "Arbitrum One",     chainId: 42161 },
  { id: "optimism", name: "OP Mainnet",       chainId: 10 },
  { id: "polygon",  name: "Polygon",          chainId: 137 },
];

const CHAIN_TYPE_OPTIONS = [
  { value: "evm",    label: "EVM (Ethereum / BSC / Polygon / etc.)" },
  { value: "solana", label: "Solana" },
  { value: "ton",    label: "TON (Toncoin)" },
  { value: "sui",    label: "Sui" },
  { value: "aptos",  label: "Aptos" },
] as const;

const CHAIN_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  evm:    { label: "EVM",  color: "#6366f1" },
  solana: { label: "SOL",  color: "#9945ff" },
  ton:    { label: "TON",  color: "#0088cc" },
  sui:    { label: "SUI",  color: "#4da2ff" },
  aptos:  { label: "APT",  color: "#00c2a8" },
};

function getAddressPlaceholder(chainType: string): string {
  switch (chainType) {
    case "solana": return "7EcDhSYG... (Solana base58 public key)";
    case "ton":    return "EQA... (TON user-friendly address)";
    case "sui":    return "0x + 64 hex chars (Sui address)";
    case "aptos":  return "0x... (Aptos account address)";
    default:       return "0x... (EVM address, 20 bytes)";
  }
}

function getPrivateKeyPlaceholder(chainType: string): string {
  switch (chainType) {
    case "solana": return "Base58 secret key or JSON array [1,2,3,...]";
    case "ton":    return "24-word mnemonic (space-separated)";
    case "sui":    return "0x-prefixed hex private key (32 bytes)";
    case "aptos":  return "0x-prefixed hex private key (32 bytes)";
    default:       return "0x-prefixed hex private key (EVM)";
  }
}

const DEFAULT_CHAIN = {
  name: "",
  symbol: "",
  chainType: "evm",
  logoUrl: "",
  rpcUrl: "",
  privateKey: "",
  walletAddress: "",
  claimAmount: "0.01",
  chainId: "",
  cooldownSeconds: 86400,
  explorerUrl: "",
  isTestnet: true,
  isEnabled: true,
  availableStatus: "YES",
  buyEnabled: false,
  buyUrl: "",
  buyRate: "1000",
  buyMinAmount: "0.0005",
  buyMaxAmount: "",
  buyCurrencies: '["eth"]',
  receiveAddress: "",
  tokenPrice: "",
  coingeckoId: "",
  soonMessage: "",
  gasPriceGwei: "",
  adClaimEnabled: false,
  adClaimAmount: "",
  adDurationSeconds: 30,
  adNetworkCode: "",
  sortOrder: 0
};

export function ChainManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: chains = [], isLoading } = useGetAdminChains({
    query: { queryKey: getGetAdminChainsQueryKey() }
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingChain, setEditingChain] = useState<ChainAdmin | null>(null);
  const [deletingChain, setDeletingChain] = useState<ChainAdmin | null>(null);
  const [formData, setFormData] = useState<any>(DEFAULT_CHAIN);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multiple RPC URLs state
  const [rpcUrlsList, setRpcUrlsList] = useState<string[]>([""]);
  const [rpcHealth, setRpcHealth] = useState<Record<string, { status: "ok" | "error"; latencyMs: number; error?: string }>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);

  const handleCheckHealth = async () => {
    if (!editingChain) return;
    setCheckingHealth(true);
    try {
      const res = await adminFetch(`/api/admin/chains/${editingChain.id}/rpc-health`);
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json() as Array<{ url: string; status: "ok" | "error"; latencyMs: number; error?: string }>;
      const map: Record<string, { status: "ok" | "error"; latencyMs: number; error?: string }> = {};
      for (const item of data) map[item.url] = item;
      setRpcHealth(map);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not run health check." });
    } finally {
      setCheckingHealth(false);
    }
  };

  const moveRpc = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= rpcUrlsList.length) return;
    const copy = [...rpcUrlsList];
    [copy[index], copy[next]] = [copy[next]!, copy[index]!];
    setRpcUrlsList(copy);
  };

  // Cooldown H/M/S state (source of truth for the form)
  const [cdH, setCdH] = useState(24);
  const [cdM, setCdM] = useState(0);
  const [cdS, setCdS] = useState(0);
  const cdPreview = useMemo(() => {
    const total = hmsToSeconds(cdH, cdM, cdS);
    return total > 0 ? formatCooldown(total) : "0s";
  }, [cdH, cdM, cdS]);

  const createMutation = useCreateChain();
  const updateMutation = useUpdateChain();
  const deleteMutation = useDeleteChain();
  const [pinningId, setPinningId] = useState<number | null>(null);

  const handleTogglePin = async (chain: ChainAdmin) => {
    setPinningId(chain.id);
    try {
      const res = await adminFetch(`/api/admin/chains/${chain.id}/pin`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to toggle pin");
      const data = await res.json() as { isPinned: boolean };
      queryClient.setQueryData(getGetAdminChainsQueryKey(), (old: ChainAdmin[] | undefined) =>
        old ? old.map(c => c.id === chain.id ? { ...c, isPinned: data.isPinned } : c) : old
      );
      toast({ title: data.isPinned ? "Pinned" : "Unpinned", description: `${chain.name} is now ${data.isPinned ? "pinned to the top" : "unpinned"}.` });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not toggle pin." });
    } finally {
      setPinningId(null);
    }
  };

  // Helpers for buy_currencies JSON array
  const getEnabledCurrencies = (): string[] => {
    try { return JSON.parse(formData.buyCurrencies || '["eth"]'); } catch { return ["eth"]; }
  };
  const toggleCurrency = (id: string) => {
    const current = getEnabledCurrencies();
    const updated = current.includes(id) ? current.filter(c => c !== id) : [...current, id];
    setFormData((p: any) => ({ ...p, buyCurrencies: JSON.stringify(updated) }));
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json() as { url: string };
      setFormData((prev: any) => ({ ...prev, logoUrl: data.url }));
      toast({ title: "Uploaded", description: "Logo uploaded successfully." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to upload image." });
    } finally {
      setUploading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingChain(null);
    setFormData(DEFAULT_CHAIN);
    setCdH(24); setCdM(0); setCdS(0);
    setRpcUrlsList([""]);
    setRpcHealth({});
    setFormError("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (chain: ChainAdmin) => {
    setEditingChain(chain);
    const { h, m, s } = secondsToHms(chain.cooldownSeconds ?? 86400);
    setCdH(h); setCdM(m); setCdS(s);
    const urls = Array.isArray(chain.rpcUrls) && chain.rpcUrls.length > 0
      ? chain.rpcUrls
      : [chain.rpcUrl];
    setRpcUrlsList(urls);
    setRpcHealth({});
    setFormData({
      ...chain,
      // Never pre-fill private key
      privateKey: "",
      // Null → empty string for all optional text fields
      chainId: chain.chainId != null ? String(chain.chainId) : "",
      logoUrl: chain.logoUrl ?? "",
      buyUrl: chain.buyUrl ?? "",
      explorerUrl: chain.explorerUrl ?? "",
      tokenPrice: chain.tokenPrice ?? "",
      coingeckoId: chain.coingeckoId ?? "",
      soonMessage: chain.soonMessage ?? "",
      gasPriceGwei: chain.gasPriceGwei ?? "",
      receiveAddress: chain.receiveAddress ?? "",
      buyRate: chain.buyRate || "1000",
      buyMinAmount: chain.buyMinAmount || "0.0005",
      buyMaxAmount: (chain as any).buyMaxAmount ?? "",
      buyCurrencies: chain.buyCurrencies || '["eth"]',
      adClaimEnabled: (chain as any).adClaimEnabled ?? false,
      adClaimAmount: (chain as any).adClaimAmount ?? "",
      adDurationSeconds: (chain as any).adDurationSeconds ?? 30,
      adNetworkCode: (chain as any).adNetworkCode ?? "",
    });
    setFormError("");
    setIsFormOpen(true);
  };

  const handleOpenDelete = (chain: ChainAdmin) => {
    setDeletingChain(chain);
    setIsDeleteOpen(true);
  };

  const handleSave = () => {
    setFormError("");
    const validRpcs = rpcUrlsList.filter(u => u.trim().length > 0);
    if (!formData.name || !formData.symbol || validRpcs.length === 0 || !formData.walletAddress) {
      setFormError("Name, symbol, at least one RPC URL, and wallet address are required.");
      return;
    }
    if (!editingChain && !formData.privateKey) {
      setFormError("Private key is required for new chains.");
      return;
    }
    if (formData.buyEnabled && getEnabledCurrencies().length === 0) {
      setFormError("Select at least one payment network when Buy is enabled.");
      return;
    }

    const payload: Record<string, unknown> = {
      ...formData,
      rpcUrls: validRpcs,
      rpcUrl: validRpcs[0],
      chainId: formData.chainId !== "" ? Number(formData.chainId) : undefined,
      cooldownSeconds: hmsToSeconds(Number(cdH), Number(cdM), Number(cdS)),
      sortOrder: Number(formData.sortOrder),
      buyRate: formData.buyRate || "1000",
      buyMinAmount: formData.buyMinAmount || "0.0005",
    };

    // Strip empty strings and nulls for optional fields — backend Zod rejects null
    const optionalFields = ["logoUrl", "buyUrl", "explorerUrl", "tokenPrice", "coingeckoId", "receiveAddress", "soonMessage", "gasPriceGwei", "buyMaxAmount", "adClaimAmount", "adNetworkCode"];
    for (const key of optionalFields) {
      if (payload[key] === null || payload[key] === "") delete payload[key];
    }

    if (editingChain && !payload.privateKey) delete payload.privateKey;

    const mutation = editingChain ? updateMutation : createMutation;
    const mutateArgs = editingChain ? { id: editingChain.id, data: payload } : { data: payload };

    (mutation as any).mutate(mutateArgs, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminChainsQueryKey() });
        setIsFormOpen(false);
        toast({ title: "Success", description: `Chain ${editingChain ? "updated" : "created"} successfully.` });
      },
      onError: (err: any) => {
        setFormError(err?.data?.error || err.message || "Failed to save chain");
      }
    });
  };

  const handleDelete = () => {
    if (!deletingChain) return;
    deleteMutation.mutate({ id: deletingChain.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminChainsQueryKey() });
        setIsDeleteOpen(false);
        toast({ title: "Success", description: "Chain deleted successfully." });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Failed to delete chain" });
      }
    });
  };

  const enabledCurrencies = getEnabledCurrencies();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">Chain Registry</h2>
        <Button onClick={handleOpenCreate} size="sm" className="font-mono">
          <Plus className="w-4 h-4 mr-2" /> Add Chain
        </Button>
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-card/50">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Drop</TableHead>
              <TableHead>Buy</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : chains.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono">
                  No chains found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              chains.map((chain) => {
                let nets: string[] = [];
                try { nets = JSON.parse(chain.buyCurrencies || '[]'); } catch { /* */ }
                return (
                  <TableRow key={chain.id} className="group">
                    <TableCell className="font-mono text-xs">{chain.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {chain.logoUrl ? (
                          <img src={chain.logoUrl} alt={chain.symbol} className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                            {chain.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold">{chain.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{chain.symbol}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={chain.isEnabled ? "default" : "secondary"} className="w-fit text-[10px]">
                          {chain.isEnabled ? "ENABLED" : "DISABLED"}
                        </Badge>
                        <Badge variant="outline" className="w-fit text-[10px]">{chain.availableStatus}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const ct = CHAIN_TYPE_BADGE[chain.chainType] ?? { label: chain.chainType.toUpperCase(), color: "#888" };
                          return (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded w-fit"
                              style={{ background: ct.color + "22", color: ct.color, border: `1px solid ${ct.color}44` }}>
                              {ct.label}
                            </span>
                          );
                        })()}
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 w-fit">
                          {chain.isTestnet ? "TESTNET" : "MAINNET"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{chain.claimAmount} / {formatCooldown(chain.cooldownSeconds)}</TableCell>
                    <TableCell>
                      {chain.buyEnabled ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="w-fit text-[10px] text-green-500 border-green-500/30 bg-green-500/10">
                            <ShoppingCart className="w-2.5 h-2.5 mr-1" /> ON
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">×{chain.buyRate} · {nets.length} net{nets.length !== 1 ? "s" : ""}</span>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="w-fit text-[10px]">OFF</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${chain.isPinned ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-amber-400"}`}
                          title={chain.isPinned ? "Unpin chain" : "Pin to top"}
                          disabled={pinningId === chain.id}
                          onClick={() => handleTogglePin(chain)}
                        >
                          {pinningId === chain.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : chain.isPinned
                              ? <Pin className="w-4 h-4 fill-current" />
                              : <PinOff className="w-4 h-4" />
                          }
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(chain)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleOpenDelete(chain)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card border-border" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight">
              {editingChain ? `Edit ${editingChain.name}` : "Deploy New Chain"}
            </DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="font-mono">{formError}</div>
            </div>
          )}

          <div className="space-y-4 py-2">

            {/* ── SECTION 1: Identity ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Settings2 className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Identity</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Network Name <span className="text-destructive">*</span></Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Ethereum Sepolia" className="font-mono text-sm h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Token Symbol <span className="text-destructive">*</span></Label>
                  <Input value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value})} placeholder="e.g. ETH" className="font-mono text-sm h-9" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Chain Type <span className="text-destructive">*</span></Label>
                  <Select value={formData.chainType ?? "evm"} onValueChange={(val) => setFormData({...formData, chainType: val, walletAddress: "", privateKey: ""})}>
                    <SelectTrigger className="font-mono text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHAIN_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="font-mono text-sm">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground font-mono">Changing chain type will clear address & private key fields.</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">RPC Endpoints <span className="text-destructive">*</span></Label>
                    <div className="flex items-center gap-1.5">
                      {editingChain && (
                        <Button
                          type="button" variant="outline" size="sm"
                          className="h-6 px-2 text-[10px] font-mono gap-1"
                          onClick={handleCheckHealth}
                          disabled={checkingHealth}
                          title="Check health of all RPC endpoints"
                        >
                          {checkingHealth
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Activity className="w-3 h-3" />}
                          Health
                        </Button>
                      )}
                      <Button
                        type="button" variant="outline" size="sm"
                        className="h-6 px-2 text-[10px] font-mono gap-1"
                        onClick={() => setRpcUrlsList(prev => [...prev, ""])}
                      >
                        <Plus className="w-3 h-3" /> Add RPC
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {rpcUrlsList.map((url, i) => {
                      const health = rpcHealth[url];
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 text-right">
                            {i === 0 ? "Primary" : `Fallback ${i}`}
                          </span>
                          <div className="relative flex-1">
                            <Input
                              value={url}
                              onChange={e => {
                                const copy = [...rpcUrlsList];
                                copy[i] = e.target.value;
                                setRpcUrlsList(copy);
                                if (health) setRpcHealth(prev => { const n = {...prev}; delete n[url]; return n; });
                              }}
                              placeholder="https://rpc.example.com"
                              className="font-mono text-xs h-8 pr-8"
                            />
                            {health && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                {health.status === "ok"
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                  : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                              </span>
                            )}
                          </div>
                          {health && (
                            <span className={`text-[10px] font-mono shrink-0 w-16 ${health.status === "ok" ? "text-green-400" : "text-red-400"}`}>
                              {health.status === "ok" ? `${health.latencyMs}ms` : "Down"}
                            </span>
                          )}
                          <div className="flex gap-0.5 shrink-0">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRpc(i, -1)} disabled={i === 0} title="Move up">
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRpc(i, 1)} disabled={i === rpcUrlsList.length - 1} title="Move down">
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRpcUrlsList(prev => prev.filter((_, idx) => idx !== i))} disabled={rpcUrlsList.length === 1} title="Remove">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">Primary is used first. Fallbacks auto-activate if primary is down.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chain ID <span className="text-muted-foreground font-normal">(EVM only)</span></Label>
                  <Input type="number" min="1" value={formData.chainId} onChange={e => setFormData({...formData, chainId: e.target.value})} placeholder="e.g. 11155111" className="font-mono text-sm h-9" />
                  <p className="text-[10px] text-muted-foreground font-mono">1=ETH · 137=Polygon · 11155111=Sepolia</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Block Explorer URL</Label>
                  <Input value={formData.explorerUrl} onChange={e => setFormData({...formData, explorerUrl: e.target.value})} placeholder="https://explorer.example.com" className="font-mono text-sm h-9" />
                  <p className="text-[10px] font-mono" style={{ color: formData.explorerUrl ? "#4ade80" : "rgba(251,191,36,0.8)" }}>
                    {formData.explorerUrl
                      ? `✓ ${formData.explorerUrl.replace(/\/$/, "")}/tx/0x...`
                      : "⚠ No TX link will show without this"}
                  </p>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg sm:col-span-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <Label className="text-xs cursor-pointer">Testnet</Label>
                    <p className="text-[10px] text-muted-foreground font-mono">Mark as test network</p>
                  </div>
                  <Switch checked={formData.isTestnet} onCheckedChange={c => setFormData({...formData, isTestnet: c})} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <Label className="text-xs cursor-pointer">Chain Enabled</Label>
                    <p className="text-[10px] text-muted-foreground font-mono">Show on the faucet hub</p>
                  </div>
                  <Switch checked={formData.isEnabled} onCheckedChange={c => setFormData({...formData, isEnabled: c})} />
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Wallet & Security ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
                <Shield className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#f87171" }}>Wallet & Security</span>
              </div>
              <div className="p-4 grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Faucet Wallet Address <span className="text-destructive">*</span></Label>
                  <Input value={formData.walletAddress} onChange={e => setFormData({...formData, walletAddress: e.target.value})} placeholder={getAddressPlaceholder(formData.chainType ?? "evm")} className="font-mono text-sm h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Private Key <span className="text-destructive">*</span>
                    {editingChain && <span className="text-muted-foreground font-normal ml-1">(leave empty to keep current)</span>}
                  </Label>
                  <Input type="password" value={formData.privateKey} onChange={e => setFormData({...formData, privateKey: e.target.value})} placeholder={getPrivateKeyPlaceholder(formData.chainType ?? "evm")} className="font-mono text-sm h-9" />
                  <p className="text-[10px] font-mono" style={{ color: "#f87171", opacity: 0.7 }}>Never share this key. It controls the faucet wallet.</p>
                </div>
              </div>
            </div>

            {/* ── SECTION 4: Faucet Drop Settings ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(34,197,94,0.05)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                <Droplets className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#4ade80" }}>Faucet Drop Settings</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Claim Amount <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input type="number" step="0.0001" value={formData.claimAmount} onChange={e => setFormData({...formData, claimAmount: e.target.value})} className="font-mono text-sm h-9 pr-16" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">{formData.symbol || "TOKEN"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">Amount sent per claim</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Clock className="w-3 h-3" /> Cooldown <span className="text-destructive">*</span></Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="relative">
                      <Input type="number" min="0" value={cdH} onChange={e => setCdH(Math.max(0, Number(e.target.value)))} className="font-mono text-sm h-9 pr-6 text-center" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">h</span>
                    </div>
                    <div className="relative">
                      <Input type="number" min="0" max="59" value={cdM} onChange={e => setCdM(Math.min(59, Math.max(0, Number(e.target.value))))} className="font-mono text-sm h-9 pr-6 text-center" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">m</span>
                    </div>
                    <div className="relative">
                      <Input type="number" min="0" max="59" value={cdS} onChange={e => setCdS(Math.min(59, Math.max(0, Number(e.target.value))))} className="font-mono text-sm h-9 pr-6 text-center" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">s</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">Total: <span className="text-primary font-bold">{cdPreview}</span></p>
                </div>
              </div>
            </div>

            {/* ── SECTION 5: Buy Feature ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(129,140,248,0.2)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(129,140,248,0.05)", borderBottom: "1px solid rgba(129,140,248,0.15)" }}>
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#818cf8" }}>Buy Feature</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{formData.buyEnabled ? "ON" : "OFF"}</span>
                  <Switch checked={formData.buyEnabled} onCheckedChange={c => setFormData({...formData, buyEnabled: c})} />
                </div>
              </div>
              {formData.buyEnabled ? (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Exchange Rate</Label>
                    <div className="relative">
                      <Input type="number" step="1" min="1" value={formData.buyRate} onChange={e => setFormData({...formData, buyRate: e.target.value})} className="font-mono text-sm h-9 pr-20" placeholder="1000" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">{formData.symbol || "TKN"}/ETH</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">1 ETH → {parseFloat(formData.buyRate || "1000").toLocaleString()} {formData.symbol || "tokens"}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minimum Purchase (ETH)</Label>
                    <Input type="number" step="0.0001" min="0.0001" value={formData.buyMinAmount} onChange={e => setFormData({...formData, buyMinAmount: e.target.value})} className="font-mono text-sm h-9" placeholder="0.0005" />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Min {formData.buyMinAmount || "0.0005"} ETH = {((parseFloat(formData.buyMinAmount || "0.0005") || 0) * parseFloat(formData.buyRate || "1000")).toFixed(4)} {formData.symbol || "tokens"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Maximum Purchase (ETH) <span className="text-muted-foreground font-normal">(blank = unlimited)</span></Label>
                    <Input type="number" step="0.0001" min="0.0001" value={formData.buyMaxAmount} onChange={e => setFormData({...formData, buyMaxAmount: e.target.value})} className="font-mono text-sm h-9" placeholder="unlimited" />
                    {formData.buyMaxAmount && parseFloat(formData.buyMaxAmount) > 0 && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Max {formData.buyMaxAmount} ETH = {((parseFloat(formData.buyMaxAmount) || 0) * parseFloat(formData.buyRate || "1000")).toFixed(4)} {formData.symbol || "tokens"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Receive Address <span className="text-muted-foreground font-normal">(mainnet payment address — blank = faucet wallet)</span></Label>
                    <Input value={formData.receiveAddress} onChange={e => setFormData({...formData, receiveAddress: e.target.value})} placeholder="0x... (optional)" className="font-mono text-sm h-9" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs">Accepted Payment Networks</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ALL_PAYMENT_NETWORKS.map((net) => {
                        const isOn = enabledCurrencies.includes(net.id);
                        return (
                          <button key={net.id} type="button" onClick={() => toggleCurrency(net.id)}
                            className="flex items-center gap-2 p-2.5 rounded-lg transition-all text-left"
                            style={{ background: isOn ? "rgba(129,140,248,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${isOn ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.08)"}` }}
                          >
                            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ background: isOn ? "#818cf8" : "rgba(255,255,255,0.08)", border: isOn ? "none" : "1px solid rgba(255,255,255,0.18)" }}>
                              {isOn && <span className="text-white text-[9px] font-bold">✓</span>}
                            </div>
                            <div>
                              <p className="text-[11px] font-mono font-semibold text-foreground leading-tight">{net.name}</p>
                              <p className="text-[9px] font-mono text-muted-foreground">ID: {net.chainId}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                  Enable Buy to let users purchase testnet tokens with real ETH.
                </div>
              )}
            </div>

            {/* ── SECTION 5b: Ad Claim Feature ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(217,119,6,0.2)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(217,119,6,0.05)", borderBottom: "1px solid rgba(217,119,6,0.15)" }}>
                <div className="flex items-center gap-2.5">
                  <Tv2 className="w-3.5 h-3.5" style={{ color: "#d97706" }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#d97706" }}>Ad Claim Feature</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{formData.adClaimEnabled ? "ON" : "OFF"}</span>
                  <Switch checked={!!formData.adClaimEnabled} onCheckedChange={c => setFormData({...formData, adClaimEnabled: c})} />
                </div>
              </div>
              {formData.adClaimEnabled ? (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ad Duration (seconds)</Label>
                    <Input
                      type="number" min="5" step="1"
                      value={formData.adDurationSeconds}
                      onChange={e => setFormData({...formData, adDurationSeconds: Number(e.target.value)})}
                      className="font-mono text-sm h-9"
                      placeholder="30"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">User must watch for {formData.adDurationSeconds}s before claiming</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ad Claim Amount <span className="text-muted-foreground font-normal">(blank = same as free claim)</span></Label>
                    <div className="relative">
                      <Input
                        type="number" step="0.00001" min="0"
                        value={formData.adClaimAmount}
                        onChange={e => setFormData({...formData, adClaimAmount: e.target.value})}
                        className="font-mono text-sm h-9 pr-16"
                        placeholder={formData.claimAmount || "same as free"}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">{formData.symbol || "TOKEN"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formData.adClaimAmount ? `${formData.adClaimAmount} ${formData.symbol || "tokens"} per ad claim` : `Uses free claim amount (${formData.claimAmount || "0"} ${formData.symbol || "tokens"})`}
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Ad URL or Embed Code <span className="text-muted-foreground font-normal">(shown in iframe during ad watch)</span></Label>
                    <textarea
                      value={formData.adNetworkCode}
                      onChange={e => setFormData({...formData, adNetworkCode: e.target.value})}
                      placeholder="https://your-ad-network.com/ad-unit or paste HTML embed code"
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">Leave blank to show a placeholder. Users see this for {formData.adDurationSeconds}s before they can claim.</p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                  Enable Ad Claims to let users watch an ad and claim extra tokens during their cooldown period — unlimited times.
                </div>
              )}
            </div>

            {/* ── SECTION 6: Appearance & Links ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Globe className="w-3.5 h-3.5" style={{ color: "#fb923c" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#fb923c" }}>Appearance & Links</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Logo */}
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs">Chain Logo</Label>
                  <div className="flex items-center gap-3">
                    {formData.logoUrl ? (
                      <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border bg-muted shrink-0">
                        <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setFormData((p: any) => ({ ...p, logoUrl: "" }))} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted/30 border border-border flex items-center justify-center shrink-0">
                        <span className="text-xs text-muted-foreground font-bold">{formData.symbol?.slice(0,2) || "?"}</span>
                      </div>
                    )}
                    <div className="flex-1 flex gap-2">
                      <Input value={formData.logoUrl} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="Paste image URL or upload" className="font-mono text-sm h-9" />
                      <Button type="button" variant="outline" size="sm" className="shrink-0 h-9" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CoinGecko ID</Label>
                  <Input value={formData.coingeckoId} onChange={e => setFormData({...formData, coingeckoId: e.target.value})} placeholder="e.g. ethereum" className="font-mono text-sm h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Token Price (USD)</Label>
                  <Input type="number" step="0.0001" value={formData.tokenPrice} onChange={e => setFormData({...formData, tokenPrice: e.target.value})} placeholder="e.g. 0.0012" className="font-mono text-sm h-9" />
                </div>
              </div>
            </div>

            {/* ── SECTION 7: Availability ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Availability & Display</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Availability Status</Label>
                  <Select value={formData.availableStatus} onValueChange={(val) => setFormData({...formData, availableStatus: val})}>
                    <SelectTrigger className="font-mono text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YES" className="font-mono">✅ YES — Faucet is live</SelectItem>
                      <SelectItem value="NO" className="font-mono">🔴 NO — Faucet is down</SelectItem>
                      <SelectItem value="SOON" className="font-mono">🟡 SOON — Coming soon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort Order</Label>
                  <Input type="number" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: e.target.value})} className="font-mono text-sm h-9" placeholder="0 = default" />
                  <p className="text-[10px] text-muted-foreground font-mono">Lower number = shown first</p>
                </div>
                {formData.availableStatus === "SOON" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">⏳ Coming Soon Message</Label>
                    <textarea
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                      value={formData.soonMessage}
                      onChange={e => setFormData({...formData, soonMessage: e.target.value})}
                      placeholder="e.g. This faucet will be live very soon. Stay tuned!"
                    />
                  </div>
                )}
              </div>
            </div>

          </div>

          <DialogFooter className="pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-mono">Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="font-mono">
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-destructive font-mono uppercase">Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-bold text-foreground">{deletingChain?.name}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} className="font-mono">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending} className="font-mono">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Purge Chain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
