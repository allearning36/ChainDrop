import { useState, useRef, useMemo, useEffect, useCallback } from "react";
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
import { Edit2, Plus, Trash2, Loader2, AlertCircle, Upload, X, ShoppingCart, Pin, PinOff, Server, Shield, Droplets, Globe, Settings2, Clock, ArrowUp, ArrowDown, Activity, CheckCircle2, XCircle, RefreshCw, Tv2, Search, Key, Copy, Database, GripVertical, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/auth";
import { formatCooldown, secondsToHms, hmsToSeconds } from "@/lib/utils";
import { ChainSelector } from "./ChainSelector";
import type { MasterChain } from "./ChainSelector";

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
  { value: "custom", label: "Custom / Other" },
] as const;

const CHAIN_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  evm:    { label: "EVM",    color: "#6366f1" },
  solana: { label: "SOL",    color: "#9945ff" },
  ton:    { label: "TON",    color: "#0088cc" },
  sui:    { label: "SUI",    color: "#4da2ff" },
  aptos:  { label: "APT",    color: "#00c2a8" },
  custom: { label: "CUSTOM", color: "#f59e0b" },
};

function getAddressPlaceholder(chainType: string): string {
  switch (chainType) {
    case "solana": return "7EcDhSYG... (Solana base58 public key)";
    case "ton":    return "EQA... (TON user-friendly address)";
    case "sui":    return "0x + 64 hex chars (Sui address)";
    case "aptos":  return "0x... (Aptos account address)";
    case "custom": return "Any address format for this chain";
    default:       return "0x... (EVM address, 20 bytes)";
  }
}

function getPrivateKeyPlaceholder(chainType: string): string {
  switch (chainType) {
    case "solana": return "Base58 secret key or JSON array [1,2,3,...]";
    case "ton":    return "24-word mnemonic (space-separated)";
    case "sui":    return "0x-prefixed hex private key (32 bytes)";
    case "aptos":  return "0x-prefixed hex private key (32 bytes)";
    case "custom": return "Private key in the format required by this chain";
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
  addressRegex: "",
  isTestnet: true,
  isEnabled: true,
  availableStatus: "YES",
  buyEnabled: false,
  buyUrl: "",
  buyRate: "1000",
  buyRates: {} as Record<string, string>,
  buyLimits: {} as Record<string, { min: string; max: string }>,
  buyMinAmount: "0.0005",
  buyMaxAmount: "",
  buyCurrencies: '["eth"]',
  receiveAddress: "",
  tokenPrice: "",
  coingeckoId: "",
  soonMessage: "",
  gasPriceGwei: "",
  gasLimit: "",
  adClaimEnabled: false,
  adClaimAmount: "",
  adDurationSeconds: 30,
  adCooldownSeconds: 0,
  adNetworkCode: "",
  adType: "url",
  captchaEnabled: true,
  sortOrder: 0
};

export function ChainManagement() {
  const [chainSearch, setChainSearch] = useState("");
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
  const [customPaymentNetworks, setCustomPaymentNetworks] = useState<{ id: string; name: string; symbol: string; chainId: number }[]>([]);
  const [systemWallet, setSystemWallet] = useState<{ configured: boolean; address: string | null; error?: string } | null>(null);
  const [copiedSysAddr, setCopiedSysAddr] = useState(false);
  const [chainSelectorOpen, setChainSelectorOpen] = useState(false);

  // ── Chain Ads state ──────────────────────────────────────────────────────────
  type ChainAdRow = { id: number; chainId: number; label: string; adUrl: string; adType: string; priority: number; isEnabled: boolean; createdAt: string };
  const [chainAds, setChainAds] = useState<ChainAdRow[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [newAd, setNewAd] = useState({ label: "", adUrl: "", adType: "vast" });
  const [addingAd, setAddingAd] = useState(false);

  const loadAds = useCallback((chainId: number) => {
    setAdsLoading(true);
    adminFetch(`/api/admin/chains/${chainId}/ads`)
      .then(r => r.ok ? r.json() : [])
      .then((data: ChainAdRow[]) => setChainAds(data))
      .catch(() => setChainAds([]))
      .finally(() => setAdsLoading(false));
  }, []);

  const handleAddAd = async (chainId: number) => {
    if (!newAd.label.trim() || !newAd.adUrl.trim()) return;
    setAddingAd(true);
    try {
      const res = await adminFetch(`/api/admin/chains/${chainId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAd, priority: chainAds.length }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setNewAd({ label: "", adUrl: "", adType: "vast" });
      loadAds(chainId);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not add ad", description: err?.message ?? "Unknown error" });
    } finally { setAddingAd(false); }
  };

  const handleToggleAd = async (chainId: number, ad: ChainAdRow) => {
    await adminFetch(`/api/admin/chains/${chainId}/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: ad.label, adUrl: ad.adUrl, adType: ad.adType, isEnabled: !ad.isEnabled }),
    });
    loadAds(chainId);
  };

  const handleDeleteAd = async (chainId: number, adId: number) => {
    await adminFetch(`/api/admin/chains/${chainId}/ads/${adId}`, { method: "DELETE" });
    loadAds(chainId);
  };

  const handleMovePriority = async (chainId: number, ad: ChainAdRow, dir: -1 | 1) => {
    const sorted = [...chainAds].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(a => a.id === ad.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swap = sorted[swapIdx]!;
    await Promise.all([
      adminFetch(`/api/admin/chains/${chainId}/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: ad.label, adUrl: ad.adUrl, adType: ad.adType, priority: swap.priority }),
      }),
      adminFetch(`/api/admin/chains/${chainId}/ads/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: swap.label, adUrl: swap.adUrl, adType: swap.adType, priority: ad.priority }),
      }),
    ]);
    loadAds(chainId);
  };

  useEffect(() => {
    adminFetch("/api/admin/system-wallet")
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => { if (data) setSystemWallet(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    adminFetch("/api/admin/payment-networks")
      .then(r => r.ok ? r.json() : [])
      .then((nets: any[]) => {
        setCustomPaymentNetworks(nets.filter((n: any) => n.isEnabled).map((n: any) => ({ id: n.networkId, name: n.name, symbol: n.symbol, chainId: n.chainId })));
      })
      .catch(() => {});
  }, []);
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
      gasLimit: chain.gasLimit != null ? String(chain.gasLimit) : "",
      receiveAddress: chain.receiveAddress ?? "",
      buyRate: chain.buyRate || "1000",
      buyRates: (() => { try { return JSON.parse((chain as any).buyRates || "{}"); } catch { return {}; } })(),
      buyLimits: (() => { try { return JSON.parse((chain as any).buyLimits || "{}"); } catch { return {}; } })(),
      buyMinAmount: chain.buyMinAmount || "0.0005",
      buyMaxAmount: (chain as any).buyMaxAmount ?? "",
      buyCurrencies: chain.buyCurrencies || '["eth"]',
      adClaimEnabled: (chain as any).adClaimEnabled ?? false,
      adClaimAmount: (chain as any).adClaimAmount ?? "",
      adDurationSeconds: (chain as any).adDurationSeconds ?? 30,
      adCooldownSeconds: (chain as any).adCooldownSeconds ?? 0,
      adNetworkCode: (chain as any).adNetworkCode ?? "",
      adType: (chain as any).adType ?? "url",
      captchaEnabled: (chain as any).captchaEnabled !== false,
      addressRegex: (chain as any).addressRegex ?? "",
    });
    setFormError("");
    setChainAds([]);
    setNewAd({ label: "", adUrl: "", adType: "vast" });
    loadAds(chain.id);
    setIsFormOpen(true);
  };

  const handleOpenDelete = (chain: ChainAdmin) => {
    setDeletingChain(chain);
    setIsDeleteOpen(true);
  };

  const handleSave = () => {
    setFormError("");
    const validRpcs = rpcUrlsList.filter(u => u.trim().length > 0);
    if (!formData.name || !formData.symbol || validRpcs.length === 0) {
      setFormError("Name, symbol, and at least one RPC URL are required.");
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
      gasLimit: formData.gasLimit !== "" ? Number(formData.gasLimit) : undefined,
      cooldownSeconds: hmsToSeconds(Number(cdH), Number(cdM), Number(cdS)),
      sortOrder: Number(formData.sortOrder),
      buyRate: formData.buyRate || "1000",
      buyRates: JSON.stringify(formData.buyRates || {}),
      buyLimits: JSON.stringify(formData.buyLimits || {}),
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

  const handleChainLibrarySelect = (chain: MasterChain) => {
    setFormData((prev: any) => ({
      ...prev,
      name: chain.name,
      symbol: chain.symbol,
      chainId: chain.chainId != null ? String(chain.chainId) : "",
      chainType: chain.chainType,
      logoUrl: chain.logoUrl ?? "",
      isTestnet: chain.isTestnet,
      explorerUrl: chain.explorerUrls[0] ?? prev.explorerUrl,
    }));
    if (chain.rpcUrls.length > 0) {
      setRpcUrlsList(chain.rpcUrls);
      setRpcHealth({});
    }
  };

  const enabledCurrencies = getEnabledCurrencies();

  return (
    <div className="space-y-6">
      {/* System Default Key Info */}
      <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.18)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-4 h-4" style={{ color: "#f87171" }} />
          <span className="font-mono text-sm font-bold" style={{ color: "#f87171" }}>System Default Key</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-1">— used when no custom key is set on a chain</span>
        </div>
        {systemWallet === null ? (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
        ) : !systemWallet.configured ? (
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#f87171" }}>
            <AlertCircle className="w-3.5 h-3.5" />
            <span>FAUCET_PRIVATE_KEY is NOT set. Go to Railway → Variables and add it.</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground w-16 shrink-0">Address:</span>
              {systemWallet.address ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <code className="text-xs font-mono truncate" style={{ color: "#4ade80" }}>{systemWallet.address}</code>
                  <button
                    className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                    onClick={() => { navigator.clipboard.writeText(systemWallet.address!); setCopiedSysAddr(true); setTimeout(() => setCopiedSysAddr(false), 1500); }}
                  >
                    {copiedSysAddr ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
              ) : (
                <span className="text-xs font-mono text-muted-foreground">{systemWallet.error ?? "Could not derive address"}</span>
              )}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">
              To change: update <span className="font-bold text-red-400">FAUCET_PRIVATE_KEY</span> in Railway → your api-server service → Variables.
              The new address will be auto-derived instantly.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">Chain Registry</h2>
        <Button onClick={handleOpenCreate} size="sm" className="font-mono">
          <Plus className="w-4 h-4 mr-2" /> Add Chain
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          value={chainSearch}
          onChange={e => setChainSearch(e.target.value)}
          placeholder="Search by name or symbol…"
          className="w-full pl-9 pr-4 py-2 rounded-xl text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-white/40 text-white/90"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.22)" }}
        />
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
              chains
              .filter(c => {
                const q = chainSearch.trim().toLowerCase();
                return !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
              })
              .map((chain) => {
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

            {/* Select from Chain Library */}
            <button
              type="button"
              onClick={() => setChainSelectorOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-mono font-bold transition-colors"
              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}
            >
              <Database className="w-4 h-4" />
              Select from Chain Library
            </button>

            {/* ── SECTION 1: Identity ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Settings2 className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Identity</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
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
                        <div key={i} className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 text-right">
                            {i === 0 ? "Primary" : `Fallback ${i}`}
                          </span>
                          <div className="relative flex-1 min-w-0">
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
                {formData.chainType === "custom" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Address Validation Patterns <span className="text-muted-foreground font-normal">(optional — one regex per line)</span></Label>
                    <textarea
                      value={formData.addressRegex}
                      onChange={e => setFormData({...formData, addressRegex: e.target.value})}
                      placeholder={"^[a-z0-9._-]+\\.near$\n^[0-9a-f]{64}$"}
                      rows={3}
                      className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    />
                    <div className="text-[10px] font-mono space-y-0.5">
                      {formData.addressRegex.trim() ? (
                        (() => {
                          const patterns = formData.addressRegex.split("\n").map((p: string) => p.trim()).filter(Boolean);
                          const invalid = patterns.filter((p: string) => { try { new RegExp(p); return false; } catch { return true; } });
                          return invalid.length > 0
                            ? <p style={{ color: "#f87171" }}>✗ Invalid pattern(s): {invalid.join(", ")}</p>
                            : <p style={{ color: "#4ade80" }}>✓ {patterns.length} pattern{patterns.length > 1 ? "s" : ""} — address valid if it matches ANY pattern</p>;
                        })()
                      ) : (
                        <p className="text-muted-foreground">
                          One regex per line. Address is valid if it matches <strong>any</strong> line.<br/>
                          NEAR example (2 formats):<br/>
                          <span className="text-primary">^[a-z0-9._-]+\.near$</span> (human name)<br/>
                          <span className="text-primary">^[0-9a-f]&#123;64&#125;$</span> (implicit account / hex)
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Block Explorer URL</Label>
                  <Input value={formData.explorerUrl} onChange={e => setFormData({...formData, explorerUrl: e.target.value})} placeholder="https://explorer.example.com" className="font-mono text-sm h-9" />
                  <p className="text-[10px] font-mono truncate" style={{ color: formData.explorerUrl ? "#4ade80" : "rgba(251,191,36,0.8)" }}>
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
                  <Label className="text-xs">Faucet Wallet Address <span className="text-muted-foreground font-normal">(blank = system default)</span></Label>
                  <Input value={formData.walletAddress} onChange={e => setFormData({...formData, walletAddress: e.target.value})} placeholder={`${getAddressPlaceholder(formData.chainType ?? "evm")} — or leave blank for system`} className="font-mono text-sm h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Private Key / Secret <span className="text-muted-foreground font-normal">(blank = use system key)</span>
                    {editingChain && <span className="text-muted-foreground font-normal ml-1">· leave empty to keep current</span>}
                  </Label>
                  <Input type="password" value={formData.privateKey} onChange={e => setFormData({...formData, privateKey: e.target.value})} placeholder={`${getPrivateKeyPlaceholder(formData.chainType ?? "evm")} — or leave blank for system`} className="font-mono text-sm h-9" />
                  {formData.chainType === "custom"
                    ? <p className="text-[10px] font-mono" style={{ color: "#f59e0b", opacity: 0.9 }}>Custom chains use EVM-compatible sending — provide a standard 0x-prefixed hex private key. Works for Metis, Celo, Linea, Kava, zkSync, and any EVM-compatible network.</p>
                    : <p className="text-[10px] font-mono" style={{ color: "#f87171", opacity: 0.7 }}>Custom key overrides system key. Leave blank to use FAUCET_PRIVATE_KEY.</p>
                  }
                </div>
              </div>
            </div>

            {/* ── SECTION 4: Faucet Drop Settings ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(34,197,94,0.05)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                <Droplets className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#4ade80" }}>Faucet Drop Settings</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">Claim Amount <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input type="number" step="0.0001" value={formData.claimAmount} onChange={e => setFormData({...formData, claimAmount: e.target.value})} className="font-mono text-sm h-9 pr-16" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">{formData.symbol || "TOKEN"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">Amount sent per claim</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gas Limit <span className="text-muted-foreground font-normal">(blank = auto 21000)</span></Label>
                  <Input type="number" min="21000" step="1000" value={formData.gasLimit} onChange={e => setFormData({...formData, gasLimit: e.target.value})} placeholder="21000" className="font-mono text-sm h-9" />
                  <p className="text-[10px] text-muted-foreground font-mono">ETH transfer = 21000 · Token contract ≥ 65000</p>
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
                <div className="p-4 space-y-3">
                  {/* Receive Address */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Receive Address <span className="text-muted-foreground font-normal">(mainnet payment address — blank = faucet wallet)</span></Label>
                    <Input value={formData.receiveAddress} onChange={e => setFormData({...formData, receiveAddress: e.target.value})} placeholder="0x... (optional)" className="font-mono text-sm h-9" />
                  </div>

                  {/* Per-network rate configuration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Payment Networks &amp; Exchange Rates</Label>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {enabledCurrencies.length} network{enabledCurrencies.length !== 1 ? "s" : ""} enabled
                      </span>
                    </div>
                    {customPaymentNetworks.length === 0 ? (
                      <div className="px-4 py-3 rounded-xl text-[11px] font-mono text-muted-foreground text-center"
                        style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
                        No payment networks configured yet.{" "}
                        <span className="text-primary">Go to Pay Networks tab to add ETH, BNB, USDT, etc.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {customPaymentNetworks.map((net) => {
                          const isOn = enabledCurrencies.includes(net.id);
                          const currentRate = (formData.buyRates as Record<string, string>)?.[net.id] ?? "";
                          return (
                            <div key={net.id} className="rounded-xl overflow-hidden transition-all"
                              style={{
                                border: `1px solid ${isOn ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.07)"}`,
                                background: isOn ? "rgba(129,140,248,0.05)" : "rgba(255,255,255,0.02)",
                              }}>
                              <div className="flex items-center gap-3 px-3 py-2.5">
                                {/* Enable toggle */}
                                <button type="button" onClick={() => toggleCurrency(net.id)}
                                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
                                  style={{
                                    background: isOn ? "#818cf8" : "rgba(255,255,255,0.07)",
                                    border: isOn ? "none" : "1px solid rgba(255,255,255,0.2)",
                                  }}>
                                  {isOn && <span className="text-white text-[10px] font-bold">✓</span>}
                                </button>
                                {/* Network info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-mono font-semibold leading-tight" style={{ color: isOn ? "#e2e8f0" : "rgba(255,255,255,0.35)" }}>
                                    {net.name}
                                  </p>
                                  <p className="text-[9px] font-mono" style={{ color: isOn ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                                    {net.symbol} · Chain {net.chainId}
                                  </p>
                                </div>
                              </div>
                              {/* Rate + per-network min/max — shown when enabled */}
                              {isOn && (() => {
                                const netLimits = ((formData.buyLimits as Record<string, { min: string; max: string }>) || {})[net.id] || { min: "", max: "" };
                                return (
                                <div className="px-3 pb-3 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-mono text-muted-foreground shrink-0 w-20">
                                      Rate ({net.symbol}):
                                    </label>
                                    <div className="relative flex-1">
                                      <Input
                                        type="number" step="any" min="0"
                                        value={currentRate}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setFormData((p: any) => ({
                                            ...p,
                                            buyRates: { ...((p.buyRates as Record<string, string>) || {}), [net.id]: val },
                                          }));
                                        }}
                                        className="font-mono text-xs h-8 w-full pr-28"
                                        placeholder={`tokens per 1 ${net.symbol}`}
                                      />
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground whitespace-nowrap pointer-events-none">
                                        {formData.symbol || "TKN"}/{net.symbol}
                                      </span>
                                    </div>
                                  </div>
                                  {currentRate && parseFloat(currentRate) > 0 ? (
                                    <p className="text-[10px] font-mono pl-[88px]" style={{ color: "rgba(129,140,248,0.8)" }}>
                                      1 {net.symbol} → {parseFloat(currentRate).toLocaleString()} {formData.symbol || "tokens"}
                                      {formData.buyMinAmount && (
                                        <span className="ml-2 text-muted-foreground">
                                          · min {formData.buyMinAmount} {net.symbol} = {((parseFloat(formData.buyMinAmount) || 0) * parseFloat(currentRate)).toFixed(4)} {formData.symbol || "tokens"}
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] font-mono text-yellow-400/70 pl-[88px]">
                                      ⚠ Enter how many {formData.symbol || "tokens"} per 1 {net.symbol}
                                    </p>
                                  )}
                                  {/* Per-network min / max override */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-mono text-muted-foreground shrink-0 w-20">Min / Max:</label>
                                    <Input
                                      type="number" step="any" min="0"
                                      value={netLimits.min}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setFormData((p: any) => ({
                                          ...p,
                                          buyLimits: { ...(p.buyLimits || {}), [net.id]: { ...(p.buyLimits?.[net.id] || {}), min: val } },
                                        }));
                                      }}
                                      className="font-mono text-xs h-7 flex-1"
                                      placeholder={`min (def: ${formData.buyMinAmount || "0.0005"})`}
                                    />
                                    <span className="text-[10px] font-mono text-muted-foreground">–</span>
                                    <Input
                                      type="number" step="any" min="0"
                                      value={netLimits.max}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setFormData((p: any) => ({
                                          ...p,
                                          buyLimits: { ...(p.buyLimits || {}), [net.id]: { ...(p.buyLimits?.[net.id] || {}), max: val } },
                                        }));
                                      }}
                                      className="font-mono text-xs h-7 flex-1"
                                      placeholder="max (blank = unlimited)"
                                    />
                                  </div>
                                  <p className="text-[10px] font-mono pl-[88px] text-muted-foreground">Per-network override — blank uses global default</p>
                                </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[10px] font-mono text-muted-foreground px-1">
                      Each currency needs its own rate. Example: ETH = 15,000 tokens/ETH · BNB = 3,500 tokens/BNB · USDT = 5 tokens/USDT
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                  Enable Buy to let users purchase testnet tokens with real ETH.
                </div>
              )}
            </div>

            {/* ── SECTION 5a2: CAPTCHA ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(99,102,241,0.05)", borderBottom: "1px solid rgba(99,102,241,0.15)" }}>
                <div className="flex items-center gap-2.5">
                  <Shield className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#818cf8" }}>reCAPTCHA</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{formData.captchaEnabled ? "ON" : "OFF"}</span>
                  <Switch checked={!!formData.captchaEnabled} onCheckedChange={c => setFormData({...formData, captchaEnabled: c})} />
                </div>
              </div>
              <div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                {formData.captchaEnabled
                  ? "Users must complete a reCAPTCHA challenge before claiming this chain."
                  : "CAPTCHA is OFF — users can claim without solving a challenge. Faster UX but higher bot risk."}
              </div>
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
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
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
                    <Label className="text-xs">Ad Watch Cooldown <span className="text-muted-foreground font-normal">(0 = unlimited)</span></Label>
                    <div className="flex items-center gap-1.5">
                      {(["h","m","s"] as const).map((unit) => {
                        const hms = secondsToHms(formData.adCooldownSeconds ?? 0);
                        return (
                          <div key={unit} className="relative flex-1">
                            <Input
                              type="number" min="0" max={unit === "h" ? 99 : 59}
                              value={hms[unit]}
                              onChange={e => {
                                const updated = { ...secondsToHms(formData.adCooldownSeconds ?? 0), [unit]: Number(e.target.value) };
                                setFormData({...formData, adCooldownSeconds: hmsToSeconds(updated.h, updated.m, updated.s)});
                              }}
                              className="font-mono text-sm h-9 pr-6"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">{unit}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {(formData.adCooldownSeconds ?? 0) > 0
                        ? `Users can watch an ad every ${formatCooldown(formData.adCooldownSeconds ?? 0)}`
                        : "Users can watch ads without cooldown"}
                    </p>
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
                    <Label className="text-xs">Ad Type</Label>
                    <select
                      value={formData.adType ?? "url"}
                      onChange={e => setFormData({...formData, adType: e.target.value})}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="url">URL — opens in new tab (popunder)</option>
                      <option value="script">Script / HTML — injected on page</option>
                      <option value="vast">VAST / MP4 — video ad (any network or direct MP4)</option>
                      <option value="hypelab">HypeLab — rewarded video SDK</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formData.adType === "vast" && "Enter a VAST tag URL (any network: Adsterra, ExoClick, Clickadu, HilltopAds…) or a direct MP4 video URL."}
                      {formData.adType === "hypelab" && "Enter HypeLab placement ID below (format: id|placement, e.g. rewarded-3c1099a1d4|3c1099a1d4)."}
                      {formData.adType === "url" && "Enter a URL — will open in a new tab when user clicks Watch Ad."}
                      {formData.adType === "script" && "Paste the ad network HTML/script embed code below."}
                      {!formData.adType && "Select how the ad will be delivered to users."}
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">
                      {formData.adType === "vast" ? "VAST Tag URL" : formData.adType === "hypelab" ? "HypeLab Placement (id|placement)" : "Ad URL or Embed Code"}
                      <span className="text-muted-foreground font-normal ml-1">(shown during ad watch)</span>
                    </Label>
                    <textarea
                      value={formData.adNetworkCode}
                      onChange={e => setFormData({...formData, adNetworkCode: e.target.value})}
                      placeholder={
                        formData.adType === "vast"
                          ? "https://adsterra.com/vast/tag?... OR https://cdn.example.com/ad.mp4"
                          : formData.adType === "hypelab"
                          ? "rewarded-3c1099a1d4|3c1099a1d4"
                          : "https://your-ad-network.com/ad-unit or paste HTML embed code"
                      }
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formData.adType === "vast"
                        ? "VAST video will play inline. Claim unlocks when video completes."
                        : formData.adType === "hypelab"
                        ? "HypeLab rewarded video plays fullscreen. Claim unlocks on video completion."
                        : `Leave blank to show a placeholder. Users see this for ${formData.adDurationSeconds}s before they can claim.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                  Enable Ad Claims to let users watch an ad and claim extra tokens during their cooldown period — unlimited times.
                </div>
              )}
            </div>

            {/* ── SECTION 5c: Video Ads Waterfall ── */}
            {formData.adClaimEnabled && formData.adType === "vast" && editingChain && (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
                <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(99,102,241,0.05)", borderBottom: "1px solid rgba(99,102,241,0.15)" }}>
                  <GripVertical className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#818cf8" }}>Video Ads Waterfall</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-1">— fallback priority order</span>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Add multiple ad networks. If the top-priority ad has no fill, the next one is tried automatically.
                  </p>

                  {/* Existing ads list */}
                  {adsLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs font-mono text-muted-foreground">Loading…</span>
                    </div>
                  ) : chainAds.length === 0 ? (
                    <div className="text-[11px] font-mono text-muted-foreground py-2">No ads configured yet. Add one below.</div>
                  ) : (
                    <div className="space-y-2">
                      {[...chainAds].sort((a, b) => a.priority - b.priority).map((ad, idx) => (
                        <div key={ad.id} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ad.isEnabled ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                          <span className="text-[10px] font-mono text-muted-foreground w-5 text-center">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-semibold truncate" style={{ color: ad.isEnabled ? "#c7d2fe" : "rgba(255,255,255,0.3)" }}>{ad.label}</p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">{ad.adUrl}</p>
                          </div>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>{ad.adType}</span>
                          <button onClick={() => handleMovePriority(editingChain.id, ad, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-white/10 disabled:opacity-20">
                            <ArrowUp className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleMovePriority(editingChain.id, ad, 1)} disabled={idx === chainAds.length - 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-20">
                            <ArrowDown className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleToggleAd(editingChain.id, ad)} className="p-1 rounded hover:bg-white/10">
                            {ad.isEnabled
                              ? <ToggleRight className="w-4 h-4" style={{ color: "#818cf8" }} />
                              : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                          </button>
                          <button onClick={() => handleDeleteAd(editingChain.id, ad.id)} className="p-1 rounded hover:bg-red-500/20">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new ad form */}
                  <div className="pt-2 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Add Ad Network</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Label (e.g. HilltopAds)"
                        value={newAd.label}
                        onChange={e => setNewAd(a => ({ ...a, label: e.target.value }))}
                        className="font-mono text-xs h-8"
                      />
                      <select
                        value={newAd.adType}
                        onChange={e => setNewAd(a => ({ ...a, adType: e.target.value }))}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring h-8"
                      >
                        <option value="vast">VAST tag URL</option>
                        <option value="mp4">Direct MP4 URL</option>
                      </select>
                    </div>
                    <Input
                      placeholder="VAST tag URL or direct MP4 URL"
                      value={newAd.adUrl}
                      onChange={e => setNewAd(a => ({ ...a, adUrl: e.target.value }))}
                      className="font-mono text-xs h-8"
                    />
                    <Button
                      className="w-full h-10 text-sm font-mono font-semibold"
                      disabled={!newAd.label.trim() || !newAd.adUrl.trim() || addingAd}
                      onClick={() => handleAddAd(editingChain.id)}
                    >
                      {addingAd ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECTION 6: Appearance & Links ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Globe className="w-3.5 h-3.5" style={{ color: "#fb923c" }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#fb923c" }}>Appearance & Links</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
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
                  <p className="text-[11px] text-muted-foreground">Recommended: 64×64px, square. PNG / SVG / WebP.</p>
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
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
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
      <ChainSelector
        open={chainSelectorOpen}
        onClose={() => setChainSelectorOpen(false)}
        onSelect={handleChainLibrarySelect}
        title="Select from Chain Library"
      />

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
