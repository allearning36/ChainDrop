import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChainPublic, useGetFaucetStatus, useClaimFaucet, getGetChainQueryKey, getGetFaucetStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink, Clock, Zap, ShoppingCart, CheckCircle2, Copy, Check, AlertCircle } from "lucide-react";
import { BuyModal } from "./BuyModal";
import { formatDistanceToNow } from "date-fns";
import ReCAPTCHA from "react-google-recaptcha";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

// ── Address helpers ──────────────────────────────────────────────────────────

function isValidAddressForChain(addr: string, chainType: string): boolean {
  switch (chainType) {
    case "solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    case "ton":
      // TON user-friendly (48-char base64url) or raw (-1:hex / 0:hex)
      return /^[A-Za-z0-9+/_\-=]{48}$/.test(addr) || /^-?[01]:[0-9a-fA-F]{64}$/.test(addr);
    case "sui":
      return /^0x[0-9a-fA-F]{64}$/.test(addr);
    case "aptos":
      return /^0x[0-9a-fA-F]{1,64}$/.test(addr);
    default: // evm
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
}

function getAddressPlaceholder(chainType: string): string {
  switch (chainType) {
    case "solana": return "7EcDhSYG... (Solana public key)";
    case "ton":    return "EQA... (TON user-friendly address)";
    case "sui":    return "0x + 64 hex chars (Sui address)";
    case "aptos":  return "0x... (Aptos account address)";
    default:       return "0x... (EVM address)";
  }
}

function getTxExplorerUrl(chainType: string, isTestnet: boolean, txHash: string): string {
  switch (chainType) {
    case "solana":
      return isTestnet
        ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
        : `https://explorer.solana.com/tx/${txHash}`;
    case "ton":
      return isTestnet
        ? `https://testnet.tonscan.org/tx/${txHash}`
        : `https://tonscan.org/tx/${txHash}`;
    case "sui":
      return isTestnet
        ? `https://testnet.suivision.xyz/txblock/${txHash}`
        : `https://suivision.xyz/txblock/${txHash}`;
    case "aptos":
      return isTestnet
        ? `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`
        : `https://explorer.aptoslabs.com/txn/${txHash}`;
    default: // evm
      return isTestnet
        ? `https://sepolia.etherscan.io/tx/${txHash}`
        : `https://etherscan.io/tx/${txHash}`;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface ClaimModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

export function ClaimModal({ chain, onClose }: ClaimModalProps) {
  const [address, setAddress] = useState("");
  const [debouncedAddress, setDebouncedAddress] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [step, setStep] = useState<"input" | "ad" | "result">("input");
  const [adCountdown, setAdCountdown] = useState(5);
  const [txHash, setTxHash] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  const queryClient = useQueryClient();
  const claimMutation = useClaimFaucet();

  const chainType = chain?.chainType ?? "evm";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAddress(isValidAddressForChain(address, chainType) ? address : "");
    }, 500);
    return () => clearTimeout(timer);
  }, [address, chainType]);

  const { data: status, isLoading: isStatusLoading } = useGetFaucetStatus(
    chain?.id || 0,
    debouncedAddress,
    { query: { enabled: !!chain && !!debouncedAddress, queryKey: getGetFaucetStatusQueryKey(chain?.id || 0, debouncedAddress) } }
  );

  useEffect(() => {
    if (step === "ad") {
      if (adCountdown > 0) {
        const timer = setTimeout(() => setAdCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setStep("result");
      }
    }
    return undefined;
  }, [step, adCountdown]);

  const handleClaim = () => {
    if (!chain || !debouncedAddress || !captchaToken) return;
    setErrorMsg("");
    claimMutation.mutate({ data: { chainId: chain.id, address: debouncedAddress, captchaToken } }, {
      onSuccess: (res) => {
        setTxHash(res.txHash);
        setClaimedAmount(res.amount);
        setCaptchaToken("");
        recaptchaRef.current?.reset();
        setStep("ad");
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey(chain.id) });
      },
      onError: (err: any) => {
        setCaptchaToken("");
        recaptchaRef.current?.reset();
        setErrorMsg(err?.data?.error || err.message || "Failed to claim");
      }
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        setStep("input"); setAddress(""); setDebouncedAddress("");
        setAdCountdown(5); setErrorMsg(""); setCaptchaToken("");
        recaptchaRef.current?.reset();
      }, 300);
      onClose();
    }
  };

  if (!chain) return null;

  // Derived states
  const addressValid = isValidAddressForChain(address, chainType);
  const inCooldown = !!debouncedAddress && !!status && !status.canClaim;
  const canSubmit = addressValid && !inCooldown && !isStatusLoading && !!captchaToken;

  const explorerUrl = getTxExplorerUrl(chainType, chain.isTestnet, txHash);

  return (
    <>
      <Dialog open={!!chain} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md w-full p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
          <div
            className="relative w-full rounded-2xl"
            style={{
              background: "linear-gradient(160deg, #0d1117 0%, #0a1628 50%, #0d1117 100%)",
              border: "1px solid rgba(34,197,94,0.2)",
              boxShadow: "0 0 40px rgba(34,197,94,0.1), 0 20px 60px rgba(0,0,0,0.8)",
            }}
          >
            {/* Top glow bar */}
            <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #22c55e, rgba(34,197,94,0.5), transparent)" }} />

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                {chain.logoUrl ? (
                  <img src={chain.logoUrl} alt={chain.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-lg" style={{ color: "#22c55e" }}>{chain.symbol.slice(0, 2)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold font-mono text-white text-base uppercase tracking-wide">{chain.name}</h2>
                  <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{
                      background: chain.isTestnet ? "rgba(34,197,94,0.15)" : "rgba(168,85,247,0.15)",
                      color: chain.isTestnet ? "#22c55e" : "#a855f7",
                      border: `1px solid ${chain.isTestnet ? "rgba(34,197,94,0.3)" : "rgba(168,85,247,0.3)"}`,
                    }}
                  >
                    {chain.isTestnet ? "TESTNET" : "MAINNET"}
                  </span>
                </div>
                <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {chain.claimAmount} {chain.symbol} · {chain.cooldownHours}h cooldown
                </p>
              </div>
              <button
                onClick={() => handleOpenChange(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
              >
                ✕
              </button>
            </div>

            {/* ── STEP: INPUT ── */}
            {step === "input" && (
              <div className="px-5 py-5 flex flex-col gap-4">

                {/* Wallet Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Wallet Address
                  </label>
                  <div className="relative">
                    <Input
                      placeholder={getAddressPlaceholder(chainType)}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="font-mono text-sm h-11 pl-4 pr-10"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: address.length > 5
                          ? addressValid
                            ? inCooldown ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.4)"
                            : "1px solid rgba(239,68,68,0.3)"
                          : "1px solid rgba(255,255,255,0.1)",
                        color: "white",
                        borderRadius: "10px",
                      }}
                    />
                    {/* Status icon */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {debouncedAddress && isStatusLoading && (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#22c55e" }} />
                      )}
                      {debouncedAddress && !isStatusLoading && status?.canClaim && (
                        <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
                      )}
                      {debouncedAddress && !isStatusLoading && inCooldown && (
                        <Clock className="w-4 h-4" style={{ color: "#ef4444" }} />
                      )}
                    </div>
                  </div>

                  {/* Cooldown message */}
                  {inCooldown && (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-mono"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Next claim {status?.nextClaimAt ? formatDistanceToNow(new Date(status.nextClaimAt), { addSuffix: true }) : "later"}
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 text-xs font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
                  </div>
                )}

                {/* reCAPTCHA — shown when address is valid and not in cooldown */}
                {addressValid && !inCooldown && (
                  <div className="flex justify-center">
                    <div className="rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      <ReCAPTCHA
                        ref={recaptchaRef}
                        sitekey={RECAPTCHA_SITE_KEY}
                        onChange={(val) => setCaptchaToken(val || "")}
                        onExpired={() => setCaptchaToken("")}
                        theme="dark"
                      />
                    </div>
                  </div>
                )}

                {/* Claim Button OR Cooldown Button */}
                {inCooldown ? (
                  <button
                    disabled
                    className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
                      color: "rgba(255,255,255,0.6)",
                      cursor: "not-allowed",
                    }}
                  >
                    <Clock className="w-4 h-4" /> Come Back in {chain.cooldownHours}h
                  </button>
                ) : (
                  <button
                    onClick={handleClaim}
                    disabled={!canSubmit || claimMutation.isPending}
                    className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all duration-200"
                    style={{
                      background: canSubmit && !claimMutation.isPending
                        ? "linear-gradient(135deg, #15803d 0%, #22c55e 100%)"
                        : "rgba(34,197,94,0.15)",
                      color: canSubmit && !claimMutation.isPending ? "white" : "rgba(34,197,94,0.4)",
                      boxShadow: canSubmit && !claimMutation.isPending ? "0 0 20px rgba(34,197,94,0.3)" : "none",
                      cursor: canSubmit && !claimMutation.isPending ? "pointer" : "not-allowed",
                    }}
                  >
                    {claimMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Request {chain.claimAmount} {chain.symbol}</>
                    )}
                  </button>
                )}

                {/* OR + Buy More */}
                {chain.buyEnabled && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <span className="text-xs font-bold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>OR</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                    <button
                      onClick={() => setBuyOpen(true)}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all duration-200"
                      style={{
                        background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
                        color: "white",
                        boxShadow: "0 0 20px rgba(37,99,235,0.25)",
                      }}
                    >
                      <ShoppingCart className="w-4 h-4" /> Buy More {chain.symbol}
                    </button>
                  </>
                )}

                {/* Info tiles */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Per Request</p>
                    <p className="text-sm font-bold font-mono" style={{ color: "#22c55e" }}>{chain.claimAmount} {chain.symbol}</p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Cooldown</p>
                    <p className="text-sm font-bold font-mono" style={{ color: "#a855f7" }}>{chain.cooldownHours}h</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP: AD / PROCESSING ── */}
            {step === "ad" && (
              <div className="px-5 py-10 flex flex-col items-center gap-6 text-center">
                <div className="relative w-20 h-20">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.2)" }}
                  />
                  <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-green-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center font-bold font-mono text-xl" style={{ color: "#22c55e" }}>
                    {adCountdown}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold font-mono text-white">Processing Transaction</h3>
                  <p className="text-sm mt-1 font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Broadcasting to {chain.name} network...
                  </p>
                </div>
                <div
                  className="w-full rounded-xl flex items-center justify-center py-6"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
                >
                  <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
                    — Advertisement —
                  </p>
                </div>
              </div>
            )}

            {/* ── STEP: RESULT ── */}
            {step === "result" && (
              <div className="px-5 py-6 flex flex-col gap-4">
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#22c55e" }} />
                  <div>
                    <p className="text-sm font-bold font-mono" style={{ color: "#22c55e" }}>Transaction Sent!</p>
                    <p className="text-xs font-mono" style={{ color: "rgba(34,197,94,0.7)" }}>
                      {claimedAmount} {chain.symbol} sent to your wallet
                    </p>
                  </div>
                </div>

                {txHash && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Transaction Hash</p>
                    </div>
                    <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{txHash}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={handleCopy}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.05)", color: copied ? "#22c55e" : "rgba(255,255,255,0.4)" }}
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  disabled
                  className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
                    color: "rgba(255,255,255,0.6)",
                    cursor: "not-allowed",
                  }}
                >
                  <Clock className="w-4 h-4" /> Come Back in {chain.cooldownHours}h
                </button>

                {chain.buyEnabled && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <span className="text-xs font-bold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>OR</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                    <button
                      onClick={() => setBuyOpen(true)}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                      style={{
                        background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
                        color: "white",
                        boxShadow: "0 0 20px rgba(37,99,235,0.25)",
                      }}
                    >
                      <ShoppingCart className="w-4 h-4" /> Buy More {chain.symbol}
                    </button>
                  </>
                )}

                <button
                  onClick={() => handleOpenChange(false)}
                  className="w-full h-10 rounded-xl text-sm font-mono"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Close
                </button>
              </div>
            )}

            <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.3), transparent)" }} />
          </div>
        </DialogContent>
      </Dialog>

      <BuyModal chain={buyOpen ? chain : null} onClose={() => setBuyOpen(false)} />
    </>
  );
}
