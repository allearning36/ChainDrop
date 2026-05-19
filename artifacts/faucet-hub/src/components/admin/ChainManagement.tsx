import { useState } from "react";
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
import { Edit2, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_CHAIN = {
  name: "",
  symbol: "",
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
  coingeckoId: "",
  sortOrder: 0
};

export function ChainManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: chains = [], isLoading } = useGetAdminChains({
    query: {
      queryKey: getGetAdminChainsQueryKey()
    }
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingChain, setEditingChain] = useState<ChainAdmin | null>(null);
  const [deletingChain, setDeletingChain] = useState<ChainAdmin | null>(null);
  const [formData, setFormData] = useState<any>(DEFAULT_CHAIN);
  const [formError, setFormError] = useState("");

  const createMutation = useCreateChain();
  const updateMutation = useUpdateChain();
  const deleteMutation = useDeleteChain();

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
      privateKey: "", // Never pre-fill private key
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
    
    // Validate required fields
    if (!formData.name || !formData.symbol || !formData.rpcUrl || !formData.walletAddress) {
      setFormError("Name, symbol, RPC URL, and wallet address are required.");
      return;
    }

    if (!editingChain && !formData.privateKey) {
      setFormError("Private key is required for new chains.");
      return;
    }

    // Coerce numbers
    const payload = {
      ...formData,
      cooldownHours: Number(formData.cooldownHours),
      sortOrder: Number(formData.sortOrder)
    };

    // Remove empty private key if editing
    if (editingChain && !payload.privateKey) {
      delete payload.privateKey;
    }

    const mutation = editingChain ? updateMutation : createMutation;
    const mutateArgs = editingChain 
      ? { id: editingChain.id, data: payload }
      : { data: payload };

    (mutation as any).mutate(mutateArgs, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminChainsQueryKey() });
        setIsFormOpen(false);
        toast({
          title: "Success",
          description: `Chain ${editingChain ? 'updated' : 'created'} successfully.`,
        });
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
        toast({
          title: "Success",
          description: "Chain deleted successfully.",
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: err?.data?.error || "Failed to delete chain",
        });
      }
    });
  };

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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : chains.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono">
                  No chains found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              chains.map((chain) => (
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
                      <Badge variant="outline" className="w-fit text-[10px]">
                        {chain.availableStatus}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {chain.isTestnet ? "TESTNET" : "MAINNET"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {chain.claimAmount} / {chain.cooldownHours}h
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
              ))
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
            <div className="space-y-2">
              <Label>Network Name *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sepolia" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Token Symbol *</Label>
              <Input value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value})} placeholder="e.g. ETH" className="font-mono" />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>RPC URL *</Label>
              <Input value={formData.rpcUrl} onChange={e => setFormData({...formData, rpcUrl: e.target.value})} placeholder="https://..." className="font-mono" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Funding Wallet Address *</Label>
              <Input value={formData.walletAddress} onChange={e => setFormData({...formData, walletAddress: e.target.value})} placeholder="0x..." className="font-mono" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Private Key {editingChain && "(Leave empty to keep current)"} {<span className="text-destructive">*</span>}</Label>
              <Input type="password" value={formData.privateKey} onChange={e => setFormData({...formData, privateKey: e.target.value})} placeholder="0x..." className="font-mono" />
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
              <Label>Logo URL</Label>
              <Input value={formData.logoUrl} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="https://..." className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label>Availability Status</Label>
              <Select value={formData.availableStatus} onValueChange={(val) => setFormData({...formData, availableStatus: val})}>
                <SelectTrigger className="font-mono">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
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

            <div className="space-y-2 md:col-span-2 pt-4 border-t border-border">
              <h4 className="font-medium text-sm mb-4">Toggles & Features</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Enabled</Label>
                  <Switch checked={formData.isEnabled} onCheckedChange={c => setFormData({...formData, isEnabled: c})} />
                </div>
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Is Testnet</Label>
                  <Switch checked={formData.isTestnet} onCheckedChange={c => setFormData({...formData, isTestnet: c})} />
                </div>
                <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
                  <Label className="cursor-pointer">Buy More Button</Label>
                  <Switch checked={formData.buyEnabled} onCheckedChange={c => setFormData({...formData, buyEnabled: c})} />
                </div>
              </div>
            </div>

            {formData.buyEnabled && (
              <div className="space-y-2 md:col-span-2 mt-2">
                <Label>Buy URL (Opens in modal/new tab)</Label>
                <Input value={formData.buyUrl} onChange={e => setFormData({...formData, buyUrl: e.target.value})} placeholder="https://..." className="font-mono" />
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
              Are you sure you want to delete <span className="font-bold text-foreground">{deletingChain?.name}</span>? This action cannot be undone and will remove all associated faucet history.
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
