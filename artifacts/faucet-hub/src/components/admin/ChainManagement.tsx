import { useState, useRef } from "react";
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
import { Edit2, Plus, Trash2, Loader2, AlertCircle, Upload, X, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

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
  cooldownHours: 24,
  isTestnet: true,
  isEnabled: true,
  availableStatus: "YES",
  buyEnabled: false,
  buyUrl: "",
  buyRate: "1000",
  buyMinAmount: "0.0005",
  buyCurrencies: '["eth"]',
  receiveAddress: "",
  tokenPrice: "",
  coingeckoId: "",
  soonMessage: "",
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

  const createMutation = useCreateChain();
  const updateMutation = useUpdateChain();
  const deleteMutation = useDeleteChain();

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
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
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
    setFormError("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (chain: ChainAdmin) => {
    setEditingChain(chain);
    setFormData({
      ...chain,
      // Never pre-fill private key
      privateKey: "",
      // Null → empty string for all optional text fields
      logoUrl: chain.logoUrl ?? "",
      buyUrl: chain.buyUrl ?? "",
      tokenPrice: chain.tokenPrice ?? "",
      coingeckoId: chain.coingeckoId ?? "",
      soonMessage: chain.soonMessage ?? "",
      receiveAddress: chain.receiveAddress ?? "",
      buyRate: chain.buyRate || "1000",
      buyMinAmount: chain.buyMinAmount || "0.0005",
      buyCurrencies: chain.buyCurrencies || '["eth"]',
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
    if (!formData.name || !formData.symbol || !formData.rpcUrl || !formData.walletAddress) {
      setFormError("Name, symbol, RPC URL, and wallet address are required.");
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
      cooldownHours: Number(formData.cooldownHours),
      sortOrder: Number(formData.sortOrder),
      buyRate: formData.buyRate || "1000",
      buyMinAmount: formData.buyMinAmount || "0.0005",
    };

    // Strip empty strings and nulls for optional fields — backend Zod rejects null
    const optionalFields = ["logoUrl", "buyUrl", "tokenPrice", "coingeckoId", "receiveAddress", "soonMessage"];
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
                    <TableCell className="font-mono text-sm">{chain.claimAmount} / {chain.cooldownHours}h</TableCell>
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
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card border-border">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label>Network Name *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sepolia" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Token Symbol *</Label>
              <Input value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value})} placeholder="e.g. ETH" className="font-mono" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Chain Type *</Label>
              <Select value={formData.chainType ?? "evm"} onValueChange={(val) => setFormData({...formData, chainType: val, walletAddress: "", privateKey: ""})}>
                <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHAIN_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground font-mono">Changing chain type will clear address & private key fields.</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>RPC URL *</Label>
              <Input value={formData.rpcUrl} onChange={e => setFormData({...formData, rpcUrl: e.target.value})} placeholder="https://..." className="font-mono" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Faucet Wallet Address *</Label>
              <Input value={formData.walletAddress} onChange={e => setFormData({...formData, walletAddress: e.target.value})} placeholder={getAddressPlaceholder(formData.chainType ?? "evm")} className="font-mono" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Private Key {editingChain && "(Leave empty to keep current)"} <span className="text-destructive">*</span></Label>
              <Input type="password" value={formData.privateKey} onChange={e => setFormData({...formData, privateKey: e.target.value})} placeholder={getPrivateKeyPlaceholder(formData.chainType ?? "evm")} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Claim Amount *</Label>
              <Input type="number" step="0.0001" value={formData.claimAmount} onChange={e => setFormData({...formData, claimAmount: e.target.value})} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Cooldown (Hours) *</Label>
              <Input type="number" min="0" value={formData.cooldownHours} onChange={e => setFormData({...formData, cooldownHours: e.target.value})} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>CoinGecko ID</Label>
              <Input value={formData.coingeckoId} onChange={e => setFormData({...formData, coingeckoId: e.target.value})} placeholder="e.g. ethereum" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Token Price (USD)</Label>
              <Input type="number" step="0.0001" value={formData.tokenPrice} onChange={e => setFormData({...formData, tokenPrice: e.target.value})} placeholder="e.g. 0.0012" className="font-mono" />
            </div>

            {/* Logo */}
            <div className="space-y-2 md:col-span-2">
              <Label>Chain Logo</Label>
              <div className="flex items-center gap-3">
                {formData.logoUrl && (
                  <div className="relative w-12 h-12 rounded-full overflow-hidden border border-border bg-muted flex-shrink-0">
                    <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setFormData((p: any) => ({ ...p, logoUrl: "" }))} className="absolute top-0 right-0 w-4 h-4 bg-destructive/80 text-white flex items-center justify-center rounded-bl">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input value={formData.logoUrl} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="Paste URL or upload..." className="font-mono text-sm" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0 font-mono" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="ml-1.5 hidden sm:inline">Upload</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">PNG/JPG/SVG · Max 5MB</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
            </div>

            {/* Availability + Order */}
            <div className="space-y-2">
              <Label>Availability Status</Label>
              <Select value={formData.availableStatus} onValueChange={(val) => setFormData({...formData, availableStatus: val})}>
                <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">YES (Green)</SelectItem>
                  <SelectItem value="NO">NO (Red)</SelectItem>
                  <SelectItem value="SOON">SOON (Yellow)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input type="number" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: e.target.value})} className="font-mono" />
            </div>

            {/* SOON message — only shown when status is SOON */}
            {formData.availableStatus === "SOON" && (
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-1.5">
                  <span>⏳</span> Coming Soon Message
                </Label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                  value={formData.soonMessage}
                  onChange={e => setFormData({...formData, soonMessage: e.target.value})}
                  placeholder="e.g. This faucet will be live very soon. Stay tuned!"
                />
                <p className="text-[11px] text-muted-foreground font-mono">
                  This message pops up when a user clicks the SOON button on the chain card.
                </p>
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-2 md:col-span-2 pt-4 border-t border-border">
              <h4 className="font-medium text-sm mb-4">Toggles & Features</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Enabled</Label>
                  <Switch checked={formData.isEnabled} onCheckedChange={c => setFormData({...formData, isEnabled: c})} />
                </div>
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Is Testnet</Label>
                  <Switch checked={formData.isTestnet} onCheckedChange={c => setFormData({...formData, isTestnet: c})} />
                </div>
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Buy Enabled</Label>
                  <Switch checked={formData.buyEnabled} onCheckedChange={c => setFormData({...formData, buyEnabled: c})} />
                </div>
              </div>
            </div>

            {/* Buy Settings — only shown when buyEnabled */}
            {formData.buyEnabled && (
              <div className="md:col-span-2 rounded-xl p-4 space-y-4" style={{ background: "rgba(129,140,248,0.05)", border: "1px solid rgba(129,140,248,0.15)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4" style={{ color: "#818cf8" }} />
                  <h4 className="font-mono font-bold text-sm uppercase tracking-wide" style={{ color: "#818cf8" }}>Buy Settings</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Exchange Rate</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        value={formData.buyRate}
                        onChange={e => setFormData({...formData, buyRate: e.target.value})}
                        className="font-mono pr-24"
                        placeholder="1000"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
                        {formData.symbol || "tokens"}/ETH
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      1 ETH → {parseFloat(formData.buyRate || "1000").toLocaleString()} {formData.symbol || "tokens"}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Minimum Purchase (ETH)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={formData.buyMinAmount}
                      onChange={e => setFormData({...formData, buyMinAmount: e.target.value})}
                      className="font-mono"
                      placeholder="0.0005"
                    />
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Min: {formData.buyMinAmount || "0.0005"} ETH → {((parseFloat(formData.buyMinAmount || "0.0005") || 0) * parseFloat(formData.buyRate || "1000")).toFixed(4)} {formData.symbol || "tokens"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Receive Address (mainnet — leave blank to use faucet wallet)</Label>
                  <Input
                    value={formData.receiveAddress}
                    onChange={e => setFormData({...formData, receiveAddress: e.target.value})}
                    placeholder="0x... (optional, defaults to faucet wallet)"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Accepted Payment Networks</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_PAYMENT_NETWORKS.map((net) => {
                      const isOn = enabledCurrencies.includes(net.id);
                      return (
                        <button
                          key={net.id}
                          type="button"
                          onClick={() => toggleCurrency(net.id)}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg transition-all text-left"
                          style={{
                            background: isOn ? "rgba(129,140,248,0.1)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isOn ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.08)"}`,
                          }}
                        >
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: isOn ? "#818cf8" : "rgba(255,255,255,0.1)", border: isOn ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                            {isOn && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                          <div>
                            <p className="text-xs font-mono font-medium text-foreground">{net.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">Chain ID {net.chainId}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Selected: {enabledCurrencies.length === 0 ? "None" : enabledCurrencies.join(", ")}
                  </p>
                </div>
              </div>
            )}
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
        <DialogContent className="sm:max-w-md bg-card border-border">
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
