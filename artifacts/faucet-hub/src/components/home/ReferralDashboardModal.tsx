import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, Users, TrendingUp, Wallet, Clock, ExternalLink, AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  useGetReferralDashboard,
  getGetReferralDashboardQueryKey,
  getReferralNonce,
  useSubmitReferralClaimRequest,
  useGetReferralSettings,
  getGetReferralSettingsQueryKey,
  useGetChains,
  getGetChainsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { WalletSelector } from "@/components/home/WalletSelector";

interface ReferralDashboardModalProps {
  open: boolean;
  onClose: () => void;
}

type WalletProvider = "injected" | "walletconnect";

interface ConnectedWallet {
  address: string;
  provider: WalletProvider;
  wcProvider?: any;
}

async function signMessageWithWallet(wallet: ConnectedWallet, message: string): Promise<string> {
  if (wallet.provider === "injected") {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No injected wallet found");
    return await eth.request({ method: "personal_sign", params: [message, wallet.address] }) as string;
  } else if (wallet.provider === "walletconnect" && wallet.wcProvider) {
    return await wallet.wcProvider.request({ method: "personal_sign", params: [message, wallet.address] }) as string;
  }
  throw new Error("No wallet provider");
}

async function detectInjectedWallet(): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const accounts = await eth.request({ method: "eth_accounts" }) as string[];
    return accounts[0] ?? null;
  } catch { return null; }
}

export function ReferralDashboardModal({ open, onClose }: ReferralDashboardModalProps) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [showAllCommissions, setShowAllCommissions] = useState(false);
  const qc = useQueryClient();

  const { data: settings } = useGetReferralSettings({
    query: { queryKey: getGetReferralSettingsQueryKey() }
  });

  const { data: chains = [] } = useGetChains(undefined, {
    query: { queryKey: getGetChainsQueryKey() }
  });

  const evmChains = chains.filter(c => c.chainType === "evm" && c.isEnabled);

  const { data: dashboard, isLoading, error: dashError } = useGetReferralDashboard(
    wallet?.address ?? "",
    {
      query: {
        enabled: !!wallet?.address,
        queryKey: getGetReferralDashboardQueryKey(wallet?.address ?? ""),
        refetchInterval: 15000,
      }
    }
  );

  const claimMutation = useSubmitReferralClaimRequest();

  // Auto-detect already-connected injected wallet on open
  useEffect(() => {
    if (!open) return;
    detectInjectedWallet().then(addr => {
      if (addr) setWallet({ address: addr.toLowerCase(), provider: "injected" });
    });
  }, [open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setWallet(null);
      setClaimError("");
      setClaimSuccess("");
      setWalletSelectorOpen(false);
    }
  }, [open]);

  const handleWalletConnected = useCallback((address: string, provider: "injected" | "walletconnect", wcProvider?: any) => {
    setWallet({ address: address.toLowerCase(), provider, wcProvider });
    setWalletSelectorOpen(false);

    // Register pending referrer from ?ref= URL param
    const pendingRef = sessionStorage.getItem("pendingReferrer");
    if (pendingRef && pendingRef !== address.toLowerCase()) {
      import("@workspace/api-client-react").then(({ registerReferral }) => {
        registerReferral({ refereeAddress: address.toLowerCase(), referrerAddress: pendingRef })
          .then(() => sessionStorage.removeItem("pendingReferrer"))
          .catch(() => {});
      });
    }
  }, []);

  const handleCopyLink = () => {
    if (!dashboard?.referralLink) return;
    navigator.clipboard.writeText(dashboard.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClaim = async () => {
    if (!wallet || !dashboard) return;
    const chainId = selectedChainId ?? evmChains[0]?.id;
    if (!chainId) { setClaimError("No chain available for claiming"); return; }

    setClaiming(true);
    setClaimError("");
    setClaimSuccess("");
    try {
      const nonceData = await getReferralNonce(wallet.address);
      const sig = await signMessageWithWallet(wallet, nonceData.message);
      const result = await claimMutation.mutateAsync({
        data: {
          wallet: wallet.address,
          signature: sig,
          nonce: nonceData.nonce,
          claimChainId: chainId,
        }
      });
      setClaimSuccess(`Claim request #${result.id} submitted for ${parseFloat(result.amountEth).toFixed(6)} ETH. Awaiting admin approval.`);
      void qc.invalidateQueries({ queryKey: getGetReferralDashboardQueryKey(wallet.address) });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? "Failed to submit claim";
      setClaimError(msg);
    } finally {
      setClaiming(false);
    }
  };

  const claimableEth = parseFloat(dashboard?.claimableEth ?? "0");
  const minClaim = 0.001;
  const canClaim = claimableEth >= minClaim && !claiming;

  const visibleCommissions = showAllCommissions
    ? (dashboard?.commissions ?? [])
    : (dashboard?.commissions ?? []).slice(0, 5);

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-2xl w-full p-0 overflow-hidden"
          onInteractOutside={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={onClose}
          style={{ background: "rgba(10,13,18,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-400" />
              <span className="font-mono font-bold text-base text-white">Referral Dashboard</span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.13)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
            >
              <X className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[80vh]">
            {/* Maintenance mode — full block, no wallet connect or dashboard */}
            {settings?.maintenanceMode ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)" }}>
                  <AlertCircle className="w-7 h-7 text-yellow-400" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="font-mono font-bold text-sm text-yellow-300">System Under Maintenance</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {settings.maintenanceMessage || "The referral system is temporarily unavailable. Please try again later."}
                  </p>
                </div>
              </div>
            ) : !wallet ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                <Wallet className="w-12 h-12 text-green-400 opacity-60" />
                <p className="text-sm font-mono text-muted-foreground text-center">
                  Connect your wallet to view your referral dashboard
                </p>
                <Button
                  onClick={() => setWalletSelectorOpen(true)}
                  className="gap-2 font-mono"
                  style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
                  variant="outline"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </Button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-green-400" />
              </div>
            ) : dashError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <AlertCircle className="w-8 h-8 opacity-40" />
                <p className="text-sm font-mono">Failed to load dashboard</p>
              </div>
            ) : dashboard ? (
              <div className="p-6 space-y-5">
                {/* Wallet + Referral Link */}
                <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground truncate">{wallet.address}</span>
                    </div>
                    <button
                      onClick={() => setWallet(null)}
                      className="text-[10px] font-mono shrink-0 px-2 py-1 rounded"
                      style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.05)" }}
                    >
                      Disconnect
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-muted-foreground mb-1.5">Your Referral Link</p>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 rounded-lg px-3 py-2 font-mono text-xs truncate"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                      >
                        {dashboard.referralLink}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopyLink}
                        className="shrink-0 gap-1.5 font-mono text-xs h-8"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Level 1 Refs", value: dashboard.level1Count, icon: Users, color: "#22c55e" },
                    { label: "Level 2 Refs", value: dashboard.level2Count, icon: Users, color: "#a78bfa" },
                    { label: "Pending ETH", value: parseFloat(dashboard.pendingCommissionEth).toFixed(6), icon: TrendingUp, color: "#f59e0b" },
                    { label: "Total Earned", value: parseFloat(dashboard.totalEarnedEth).toFixed(6), icon: TrendingUp, color: "#22c55e" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                      </div>
                      <p className="font-mono font-bold text-sm" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Claim section */}
                <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center justify-between">
                    <p className="font-mono font-semibold text-sm">Claimable Commission</p>
                    <span className="font-mono font-bold text-green-400 text-lg">{claimableEth.toFixed(6)} ETH</span>
                  </div>

                  {evmChains.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-1.5">Receive on chain</p>
                      <select
                        className="w-full rounded-lg px-3 py-2 font-mono text-xs bg-transparent outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
                        value={selectedChainId ?? evmChains[0]?.id ?? ""}
                        onChange={e => setSelectedChainId(Number(e.target.value))}
                      >
                        {evmChains.map(c => (
                          <option key={c.id} value={c.id} style={{ background: "#0a0d12" }}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {claimError && (
                    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <p className="text-xs font-mono text-red-400">{claimError}</p>
                    </div>
                  )}
                  {claimSuccess && (
                    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      <p className="text-xs font-mono text-green-400">{claimSuccess}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleClaim}
                    disabled={!canClaim || settings?.maintenanceMode}
                    className="w-full font-mono gap-2"
                    style={{ background: canClaim && !settings?.maintenanceMode ? "rgba(34,197,94,0.15)" : undefined, borderColor: "rgba(34,197,94,0.3)" }}
                    variant="outline"
                  >
                    {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                    {claiming ? "Signing…" : "Request Claim (sign required)"}
                  </Button>
                  {!canClaim && !settings?.maintenanceMode && (
                    <p className="text-xs font-mono text-muted-foreground text-center">
                      Minimum {minClaim} ETH required to claim
                    </p>
                  )}
                </div>

                {/* Claim requests */}
                {dashboard.claimRequests.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-mono font-semibold text-sm">Claim Requests</p>
                    <div className="space-y-2">
                      {dashboard.claimRequests.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-mono text-xs">{parseFloat(r.amountEth).toFixed(6)} ETH</span>
                            {r.txHash && (
                              <a href={`https://etherscan.io/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-green-400" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {r.adminNote && <span className="text-xs font-mono text-muted-foreground">{r.adminNote}</span>}
                            <Badge
                              className="font-mono text-[10px]"
                              style={{
                                background: r.status === "approved" ? "rgba(34,197,94,0.15)" : r.status === "rejected" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                                color: r.status === "approved" ? "#22c55e" : r.status === "rejected" ? "#ef4444" : "#eab308",
                                border: "none"
                              }}
                            >
                              {r.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commission history */}
                {dashboard.commissions.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-mono font-semibold text-sm">Commission History</p>
                    <div className="space-y-1.5">
                      {visibleCommissions.map(c => (
                        <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: c.level === 1 ? "rgba(34,197,94,0.1)" : "rgba(167,139,250,0.1)", color: c.level === 1 ? "#22c55e" : "#a78bfa" }}>
                              L{c.level}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground truncate">{c.refereeAddress.slice(0, 10)}…</span>
                            <span className="font-mono text-xs text-muted-foreground">{c.sourceType}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs text-green-400">+{parseFloat(c.amountEth).toFixed(6)}</span>
                            <Badge
                              className="font-mono text-[9px]"
                              style={{
                                background: c.status === "paid" ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                                color: c.status === "paid" ? "#22c55e" : "#eab308",
                                border: "none"
                              }}
                            >
                              {c.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {dashboard.commissions.length > 5 && (
                      <button
                        onClick={() => setShowAllCommissions(v => !v)}
                        className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-green-400 transition-colors"
                      >
                        {showAllCommissions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {showAllCommissions ? "Show less" : `Show all ${dashboard.commissions.length}`}
                      </button>
                    )}
                  </div>
                )}

                {dashboard.commissions.length === 0 && dashboard.claimRequests.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <TrendingUp className="w-8 h-8 opacity-30" />
                    <p className="text-xs font-mono">No referral activity yet. Share your link to start earning!</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <WalletSelector
        open={walletSelectorOpen}
        onClose={() => setWalletSelectorOpen(false)}
        onConnected={handleWalletConnected}
      />
    </>
  );
}
