import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChainPublic, useGetFaucetStatus, useClaimFaucet, useRequestAdToken, useClaimFaucetWithAd, getGetChainQueryKey, getGetFaucetStatusQueryKey, getGetFaucetHistoryQueryKey } from "@workspace/api-client-react";
import { formatCooldown } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink, Clock, Zap, ShoppingCart, CheckCircle2, Copy, Check, AlertCircle, Play } from "lucide-react";
import { BuyModal } from "./BuyModal";
import { formatDistanceToNow } from "date-fns";
import ReCAPTCHA from "react-google-recaptcha";
import { VastPlayer } from "./VastPlayer";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

// ── Device fingerprint ────────────────────────────────────────────────────────
async function collectFingerprint(): Promise<string> {
  try {
    const signals: string[] = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      String(screen.colorDepth),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.platform,
      String(navigator.hardwareConcurrency ?? 0),
      String((navigator as { deviceMemory?: number }).deviceMemory ?? 0),
    ];
    // Canvas fingerprint
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(0, 0, 80, 20);
        ctx.fillStyle = "#0d1117";
        ctx.fillText("ChainDrop", 2, 4);
        signals.push(canvas.toDataURL());
      }
    } catch { /* ignore */ }
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signals.join("|")));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// ── Address helpers ──────────────────────────────────────────────────────────

function isValidAddressForChain(addr: string, chainType: string, addressRegex?: string | null): boolean {
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
    case "custom": {
      if (!addr || addr.trim().length === 0) return false;
      if (addressRegex) {
        // Support multi-line patterns: each non-empty line is one regex, accept if ANY matches
        const patterns = addressRegex.split("\n").map(p => p.trim()).filter(Boolean);
        for (const pattern of patterns) {
          try { if (new RegExp(pattern).test(addr)) return true; } catch { /* skip invalid pattern */ }
        }
        // If patterns exist but none matched, fall through to length check only if ALL patterns were invalid
        if (patterns.length > 0) return false;
      }
      return addr.trim().length >= 8;
    }
    default: // evm
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
}

function getAddressPlaceholder(chainType: string, addressRegex?: string | null): string {
  switch (chainType) {
    case "solana": return "7EcDhSYG... (Solana public key)";
    case "ton":    return "EQA... (TON user-friendly address)";
    case "sui":    return "0x + 64 hex chars (Sui address)";
    case "aptos":  return "0x... (Aptos account address)";
    case "custom": return "Enter your wallet address";
    default:       return "0x... (EVM address)";
  }
}

function getTxExplorerUrl(chainType: string, isTestnet: boolean, txHash: string, customExplorerUrl?: string | null): string {
  // If admin set a custom explorer URL for this chain, use it
  if (customExplorerUrl) {
    const base = customExplorerUrl.replace(/\/$/, "");
    return `${base}/tx/${txHash}`;
  }
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

const ProcessingAdBanner = memo(function ProcessingAdBanner({ html }: { html: string }) {
  if (!html) return (
    <div className="flex items-center justify-center py-6">
      <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
        — Advertisement —
      </p>
    </div>
  );
  return <div className="w-full" dangerouslySetInnerHTML={{ __html: html }} />;
});

export function ClaimModal({ chain, onClose }: ClaimModalProps) {
  const [address, setAddress] = useState("");
  const [debouncedAddress, setDebouncedAddress] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [step, setStep] = useState<"input" | "watch-ad" | "ad" | "result">("input");
  const [adCountdown, setAdCountdown] = useState(5);
  const [txHash, setTxHash] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [adWatchCountdown, setAdWatchCountdown] = useState(0);
  const [adWatchDuration, setAdWatchDuration] = useState(30);
  const [adWatchToken, setAdWatchToken] = useState("");
  const [adWatchContent, setAdWatchContent] = useState<string | null>(null);
  const [adWatchError, setAdWatchError] = useState("");
  const [adType, setAdType] = useState<"url" | "script" | "vast" | "hypelab">("url");
  // Waterfall: list of ad URLs to try in order; index tracks current position
  const [adWaterfall, setAdWaterfall]         = useState<string[]>([]);
  const [adWaterfallIndex, setAdWaterfallIndex] = useState(0);
  const [processingAdHtml, setProcessingAdHtml] = useState("");
  const [remainingSecs, setRemainingSecs] = useState(0);
  const [captchaExpired, setCaptchaExpired] = useState(false);
  const [ipLimitReached, setIpLimitReached] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const adWindowRef = useRef<Window | null>(null);

  const queryClient = useQueryClient();
  const claimMutation = useClaimFaucet();
  const requestAdTokenMutation = useRequestAdToken();
  const adClaimMutation = useClaimFaucetWithAd();

  const chainType = chain?.chainType ?? "evm";

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((d: Record<string, string>) => { if (d.adProcessingHtml) setProcessingAdHtml(d.adProcessingHtml); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAddress(isValidAddressForChain(address, chainType, (chain as any)?.addressRegex) ? address : "");
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

  // Live countdown until next claim
  useEffect(() => {
    if (step !== "result") return;
    const nextAt = status?.nextClaimAt ? new Date(status.nextClaimAt).getTime() : null;
    if (!nextAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((nextAt - Date.now()) / 1000));
      setRemainingSecs(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, status?.nextClaimAt]);

  useEffect(() => {
    if (step !== "watch-ad") return;
    if (adWatchCountdown <= 0) return;
    if (adType === "vast" || adType === "hypelab") return;
    const timer = setTimeout(() => setAdWatchCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, adWatchCountdown, adType]);

  // ── Inject ad scripts directly into page DOM (not iframe) when watching ad ──
  useEffect(() => {
    if (step !== "watch-ad" || !adWatchContent || adWatchContent.startsWith("http")) return;
    if (adType === "vast" || adType === "hypelab") return;

    const injected: HTMLScriptElement[] = [];
    const template = document.createElement("div");
    template.innerHTML = adWatchContent;

    // Non-script nodes → ad container div
    const container = adContainerRef.current;
    if (container) {
      container.innerHTML = "";
      template.childNodes.forEach(node => {
        if ((node as Element).tagName !== "SCRIPT") {
          container.appendChild(node.cloneNode(true));
        }
      });
    }

    // Script tags → inject into document.body so they run in full page context
    template.querySelectorAll("script").forEach(s => {
      const el = document.createElement("script");
      if (s.src) {
        el.src = s.src;
      } else {
        el.textContent = s.textContent;
      }
      el.async = true;
      document.body.appendChild(el);
      injected.push(el);
    });

    return () => {
      injected.forEach(el => el.parentNode?.removeChild(el));
    };
  }, [step, adWatchContent]);

  // When modal opens in cooldown → always show result step (restore txHash from localStorage if available, fallback to API)
  useEffect(() => {
    if (!chain || !debouncedAddress || !status || status.canClaim || step !== "input") return;
    try {
      const stored = localStorage.getItem(`cd:tx:${chain.id}:${debouncedAddress.toLowerCase()}`);
      if (stored) {
        const { txHash: storedHash, amount } = JSON.parse(stored);
        setTxHash(storedHash ?? status.lastTxHash ?? "");
        setClaimedAmount(amount ?? chain.claimAmount);
      } else {
        // fallback: use lastTxHash returned by the status API (works even if localStorage was cleared)
        setTxHash(status.lastTxHash ?? "");
        setClaimedAmount(chain.claimAmount);
      }
    } catch {
      setTxHash(status.lastTxHash ?? "");
      setClaimedAmount(chain.claimAmount);
    }
    setStep("result");
  }, [chain, debouncedAddress, status, step]);

  const handleClaim = useCallback(async () => {
    const needsCaptcha = (chain as any)?.captchaEnabled !== false;
    if (!chain || !debouncedAddress || (needsCaptcha && !captchaToken)) return;
    setErrorMsg("");

    // Collect fingerprint + timezone silently
    const [fp, tz] = await Promise.all([
      collectFingerprint(),
      Promise.resolve(Intl.DateTimeFormat().resolvedOptions().timeZone),
    ]);

    claimMutation.mutate({
      data: {
        chainId: chain.id,
        address: debouncedAddress,
        captchaToken,
        fingerprint: fp || undefined,
        timezone: tz || undefined,
        userAgent: navigator.userAgent || undefined,
      }
    }, {
      onSuccess: (res) => {
        setTxHash(res.txHash);
        setClaimedAmount(res.amount);
        setCaptchaToken("");
        recaptchaRef.current?.reset();
        setAdCountdown(5);
        setStep("ad");
        // Persist so cooldown re-open shows result step
        try {
          localStorage.setItem(
            `cd:tx:${chain.id}:${debouncedAddress.toLowerCase()}`,
            JSON.stringify({ txHash: res.txHash, amount: res.amount })
          );
        } catch {}
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey(chain.id) });
        queryClient.invalidateQueries({ queryKey: getGetFaucetHistoryQueryKey() });
        // Register referral (fire-and-forget)
        const pendingRef = sessionStorage.getItem("pendingReferrer");
        if (pendingRef && pendingRef !== debouncedAddress.toLowerCase()) {
          import("@workspace/api-client-react").then(({ registerReferral }) => {
            registerReferral({ refereeAddress: debouncedAddress.toLowerCase(), referrerAddress: pendingRef })
              .then(() => sessionStorage.removeItem("pendingReferrer"))
              .catch(() => {});
          });
        }
      },
      onError: (err: any) => {
        setCaptchaToken("");
        recaptchaRef.current?.reset();
        if (err?.data?.ipLimitReached) {
          setIpLimitReached(true);
        }
        setErrorMsg(err?.data?.error || err.message || "Failed to claim");
      }
    });
  }, [chain, debouncedAddress, captchaToken, claimMutation, queryClient]);

  const handleWatchAd = () => {
    if (!chain || !debouncedAddress) return;
    setAdWatchError("");

    // Pre-open a blank window SYNCHRONOUSLY (inside the click handler) so
    // mobile popup blockers don't suppress it. We navigate it to the ad URL
    // once the API responds. For script-based ads we close it immediately.
    const preOpened = window.open("about:blank", "_blank");
    adWindowRef.current = preOpened;

    requestAdTokenMutation.mutate(
      { data: { chainId: chain.id, address: debouncedAddress } },
      {
        onSuccess: async (res) => {
          const resolvedType = (res.adType ?? "url") as "url" | "script" | "vast" | "hypelab";
          setAdWatchToken(res.token);
          setAdType(resolvedType);
          setAdWatchCountdown(resolvedType === "vast" || resolvedType === "hypelab" ? 1 : res.durationSeconds);
          setAdWatchDuration(res.durationSeconds);

          if (resolvedType === "vast") {
            // Fetch waterfall ads for this chain
            let waterfall: string[] = [];
            try {
              const r = await fetch(`/api/chains/${chain.id}/ads`);
              if (r.ok) {
                const ads = await r.json() as Array<{ adUrl: string }>;
                waterfall = ads.map(a => a.adUrl).filter(Boolean);
              }
            } catch { /* ignore — fall back to adContent */ }

            // If waterfall has ads, use those; otherwise fall back to legacy adNetworkCode
            if (waterfall.length > 0) {
              setAdWaterfall(waterfall);
              setAdWaterfallIndex(0);
              setAdWatchContent(waterfall[0] ?? null);
            } else {
              setAdWaterfall(res.adContent ? [res.adContent] : []);
              setAdWaterfallIndex(0);
              setAdWatchContent(res.adContent ?? null);
            }
            adWindowRef.current?.close();
            adWindowRef.current = null;
            setStep("watch-ad");
            return;
          }

          setAdWatchContent(res.adContent ?? null);
          setAdWaterfall([]);
          setAdWaterfallIndex(0);

          if (resolvedType === "url" && res.adContent) {
            if (adWindowRef.current && !adWindowRef.current.closed) {
              adWindowRef.current.location.href = res.adContent;
            } else {
              window.open(res.adContent, "_blank");
            }
          } else {
            adWindowRef.current?.close();
          }
          adWindowRef.current = null;
          setStep("watch-ad");
        },
        onError: (err: any) => {
          adWindowRef.current?.close();
          adWindowRef.current = null;
          setAdWatchError(err?.data?.error || "Could not start ad. Please try again.");
        },
      }
    );
  };

  const handleAdClaim = () => {
    if (!chain || !debouncedAddress || !adWatchToken) return;
    setAdWatchError("");
    adClaimMutation.mutate(
      { data: { token: adWatchToken, chainId: chain.id, address: debouncedAddress } },
      {
        onSuccess: (res) => {
          setTxHash(res.txHash);
          setClaimedAmount(res.amount);
          setAdWatchToken("");
          setAdCountdown(5);
          setStep("ad");
          queryClient.invalidateQueries({ queryKey: getGetChainQueryKey(chain.id) });
          queryClient.invalidateQueries({ queryKey: getGetFaucetHistoryQueryKey() });
          // Register referral (fire-and-forget)
          const pendingRef = sessionStorage.getItem("pendingReferrer");
          if (pendingRef && pendingRef !== debouncedAddress.toLowerCase()) {
            import("@workspace/api-client-react").then(({ registerReferral }) => {
              registerReferral({ refereeAddress: debouncedAddress.toLowerCase(), referrerAddress: pendingRef })
                .then(() => sessionStorage.removeItem("pendingReferrer"))
                .catch(() => {});
            });
          }
        },
        onError: (err: any) => {
          setAdWatchError(err?.data?.error || "Claim failed. Please try again.");
        },
      }
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    // Never close via Dialog events while the full-screen ad overlay is active
    if (!open && step === "watch-ad") return;
    if (!open) {
      setTimeout(() => {
        setStep("input"); setAddress(""); setDebouncedAddress("");
        setAdCountdown(5); setErrorMsg(""); setCaptchaToken("");
        setAdWatchToken(""); setAdWatchContent(null); setAdWatchCountdown(0); setAdWatchError(""); setAdType("url");
        setIpLimitReached(false);
        recaptchaRef.current?.reset();
      }, 300);
      onClose();
    }
  };

  if (!chain) return null;

  // Derived states
  const addressValid = isValidAddressForChain(address, chainType, (chain as any)?.addressRegex);
  const inCooldown = !!debouncedAddress && !!status && !status.canClaim;
  const chainCaptchaEnabled = (chain as any).captchaEnabled !== false;
  const canSubmit = addressValid && !inCooldown && !isStatusLoading && (chainCaptchaEnabled ? !!captchaToken : true);

  const explorerUrl = getTxExplorerUrl(chainType, chain.isTestnet, txHash, chain.explorerUrl);

  return (
    <>
      {/* Dialog is closed during "watch-ad" so its backdrop doesn't capture taps on the overlay */}
      <Dialog open={!!chain && step !== "watch-ad"} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md w-full p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
          <div
            className="relative w-full rounded-2xl overflow-hidden"
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
                  {chain.claimAmount} {chain.symbol} · {formatCooldown(chain.cooldownSeconds)} cooldown
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
                      placeholder={getAddressPlaceholder(chainType, (chain as any)?.addressRegex)}
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
                  <div className="flex items-center gap-2 text-xs font-mono px-3 py-2 rounded-lg" style={{ background: ipLimitReached ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.08)", color: ipLimitReached ? "#fbbf24" : "#f87171", border: ipLimitReached ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
                  </div>
                )}

                {/* Watch Ad — shown when IP daily limit is reached */}
                {ipLimitReached && (chain as any).adClaimEnabled && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <span className="text-[10px] font-bold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>WATCH AN AD TO CONTINUE</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                    {adWatchError && (
                      <p className="text-xs font-mono text-center px-3 py-2 rounded-xl" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{adWatchError}</p>
                    )}
                    <button
                      onClick={handleWatchAd}
                      disabled={requestAdTokenMutation.isPending}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all duration-200"
                      style={{
                        background: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.1)" : "linear-gradient(135deg, #78350f 0%, #d97706 100%)",
                        color: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.4)" : "white",
                        boxShadow: requestAdTokenMutation.isPending ? "none" : "0 0 20px rgba(217,119,6,0.3)",
                        cursor: requestAdTokenMutation.isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      {requestAdTokenMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting Ad...</>
                        : <><Play className="w-4 h-4" /> Watch Ad · Claim More</>
                      }
                    </button>
                  </>
                )}

                {/* reCAPTCHA — only when chain requires it AND address is valid and not in cooldown */}
                {chainCaptchaEnabled && addressValid && !inCooldown && (
                  <div className="flex flex-col items-center gap-1.5">
                    {captchaExpired && (
                      <div className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-lg w-full" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> CAPTCHA expired — please verify again
                      </div>
                    )}
                    {/* onMouseDown blurs any active input so mobile keyboard doesn't pop up when tapping CAPTCHA images */}
                    <div
                      className="rounded-xl"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      onMouseDown={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}
                      onTouchStart={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}
                    >
                      <ReCAPTCHA
                        ref={recaptchaRef}
                        sitekey={RECAPTCHA_SITE_KEY}
                        onChange={(val) => { setCaptchaToken(val || ""); setCaptchaExpired(false); }}
                        onExpired={() => { setCaptchaToken(""); setCaptchaExpired(true); }}
                        theme="dark"
                      />
                    </div>
                  </div>
                )}

                {/* Claim Button OR Cooldown Button */}
                {inCooldown ? (
                  <>
                    <button
                      disabled
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                      style={{
                        background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
                        color: "rgba(255,255,255,0.6)",
                        cursor: "not-allowed",
                      }}
                    >
                      <Clock className="w-4 h-4" /> Come Back in {formatCooldown(chain.cooldownSeconds)}
                    </button>

                    {(chain as any).adClaimEnabled && (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                          <span className="text-[10px] font-bold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>OR</span>
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                        </div>
                        {adWatchError && (
                          <p className="text-xs font-mono text-center px-3 py-2 rounded-xl" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{adWatchError}</p>
                        )}
                        <button
                          onClick={handleWatchAd}
                          disabled={requestAdTokenMutation.isPending}
                          className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all duration-200"
                          style={{
                            background: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.1)" : "linear-gradient(135deg, #78350f 0%, #d97706 100%)",
                            color: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.4)" : "white",
                            boxShadow: requestAdTokenMutation.isPending ? "none" : "0 0 20px rgba(217,119,6,0.3)",
                            cursor: requestAdTokenMutation.isPending ? "not-allowed" : "pointer",
                          }}
                        >
                          {requestAdTokenMutation.isPending
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting Ad...</>
                            : <><Play className="w-4 h-4" /> Claim More · Watch Ad</>
                          }
                        </button>
                      </>
                    )}
                  </>
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
                      <span className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending to blockchain...</span>
                        <span className="text-[10px] font-mono opacity-60 normal-case tracking-normal">This may take 15–30 seconds</span>
                      </span>
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
                    <p className="text-sm font-bold font-mono" style={{ color: "#a855f7" }}>{formatCooldown(chain.cooldownSeconds)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP: WATCH AD — rendered as full-screen overlay outside Dialog ── */}

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
                  className="w-full rounded-xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
                >
                  <ProcessingAdBanner html={processingAdHtml} />
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
                    <div className="px-3 py-2.5 flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs font-mono truncate min-w-0 flex-1" style={{ color: "rgba(255,255,255,0.6)" }}>{txHash}</span>
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

                <div className="flex flex-col items-center gap-1.5">
                  <button
                    disabled
                    className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
                      color: "rgba(255,255,255,0.6)",
                      cursor: "not-allowed",
                    }}
                  >
                    <Clock className="w-4 h-4" /> Come Back in {formatCooldown(chain.cooldownSeconds)}
                  </button>
                  {remainingSecs > 0 && (
                    <p className="text-[11px] font-mono tabular-nums" style={{ color: "rgba(167,139,250,0.7)" }}>
                      {String(Math.floor(remainingSecs / 3600)).padStart(2, "0")}:
                      {String(Math.floor((remainingSecs % 3600) / 60)).padStart(2, "0")}:
                      {String(remainingSecs % 60).padStart(2, "0")} remaining
                    </p>
                  )}
                </div>

                {(chain as any).adClaimEnabled && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <span className="text-xs font-bold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>OR</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                        {adWatchError && (
                          <p className="text-xs font-mono text-center px-3 py-2 rounded-xl" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{adWatchError}</p>
                        )}
                    <button
                      onClick={handleWatchAd}
                      disabled={requestAdTokenMutation.isPending}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all duration-200"
                      style={{
                        background: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.1)" : "linear-gradient(135deg, #78350f 0%, #d97706 100%)",
                        color: requestAdTokenMutation.isPending ? "rgba(234,179,8,0.4)" : "white",
                        boxShadow: requestAdTokenMutation.isPending ? "none" : "0 0 20px rgba(217,119,6,0.3)",
                        cursor: requestAdTokenMutation.isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      {requestAdTokenMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting Ad...</>
                        : <><Play className="w-4 h-4" /> Claim More · Watch Ad</>
                      }
                    </button>
                  </>
                )}

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

      {/* ── FULL-SCREEN AD OVERLAY ── */}
      {step === "watch-ad" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "#000",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Top bar ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "rgba(255,255,255,0.03)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Play style={{ width: "14px", height: "14px", color: "#d97706" }} />
                <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Watch Ad · Earn {chain?.symbol}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "20px",
                  fontWeight: 900,
                  color: adWatchCountdown > 0 ? "#d97706" : "#22c55e",
                  minWidth: "48px",
                  textAlign: "right",
                }}
              >
                {adWatchCountdown > 0
                  ? (adType === "vast" || adType === "hypelab")
                    ? <span style={{ fontSize: "10px", letterSpacing: "0.05em", fontWeight: 600, opacity: 0.7 }}>LIVE</span>
                    : `${adWatchCountdown}s`
                  : "✓"}
              </div>
            </div>

            {/* ── Progress bar ── */}
            <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div
                style={{
                  height: "100%",
                  background: adWatchCountdown > 0 ? "#d97706" : "#22c55e",
                  transition: "width 1s linear",
                  width: "100%",
                }}
              />
            </div>

            {/* ── Ad area — fills remaining space ── */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#000" }}>
              {/* VAST video player */}
              {adType === "vast" && adWatchContent && (
                <VastPlayer
                  vastUrl={adWatchContent}
                  durationSeconds={adWatchDuration}
                  onComplete={() => setAdWatchCountdown(0)}
                  onError={(msg) => setAdWatchError(msg)}
                />
              )}

              {/* HypeLab rewarded video */}
              {adType === "hypelab" && (() => {
                const [id, placement] = (adWatchContent ?? "").split("|");
                if (!id || !placement) return (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>HypeLab ad loading…</p>
                  </div>
                );
                return (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px" }}>
                    {/* HypeLab custom element — SDK must be loaded in index.html */}
                    {/* @ts-expect-error custom element */}
                    <hype-rewarded
                      id={`hype-${id}`}
                      placement={placement}
                      ref={(el: Element | null) => {
                        if (!el) return;
                        const handler = () => setAdWatchCountdown(0);
                        el.addEventListener("rewarded", handler);
                        el.addEventListener("complete", handler);
                        el.addEventListener("adComplete", handler);
                      }}
                    />
                    <button
                      onClick={() => {
                        const el = document.getElementById(`hype-${id}`) as any;
                        el?.show?.();
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "12px", background: "linear-gradient(135deg, #78350f 0%, #d97706 100%)", border: "none", fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "white", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      <Play style={{ width: "16px", height: "16px" }} /> Play Ad
                    </button>
                    <p style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                      Watch the full video ad to unlock your claim.
                    </p>
                  </div>
                );
              })()}

              {/* URL-based (popunder): already opened in new tab */}
              {adType === "url" && adWatchContent && (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(217,119,6,0.1)", border: "2px solid rgba(217,119,6,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Play style={{ width: "28px", height: "28px", color: "#d97706" }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Ad opened in new tab</p>
                    <p style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.35)", lineHeight: "1.6" }}>
                      Please view the ad in the new tab.<br />
                      Come back here when the timer finishes.
                    </p>
                  </div>
                  <a href={adWatchContent} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 20px", borderRadius: "10px", background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", fontFamily: "monospace", fontSize: "11px", color: "#d97706", textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none" }}>
                    Reopen Ad ↗
                  </a>
                </div>
              )}

              {/* Script-based: rendered directly in page DOM via useEffect */}
              {adType === "script" && (
                <div ref={adContainerRef} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }} />
              )}

              {/* Loading state */}
              {!adWatchContent && adType !== "vast" && (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "3px solid rgba(217,119,6,0.3)", borderTopColor: "#d97706", animation: "spin 1s linear infinite" }} />
                  <p style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Loading ad…</p>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}
            </div>

            {/* ── Bottom action bar ── */}
            <div
              style={{
                flexShrink: 0,
                padding: "16px",
                background: "rgba(0,0,0,0.9)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {adWatchError && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <AlertCircle style={{ width: "14px", height: "14px", color: "#f87171", flexShrink: 0 }} />
                  <p style={{ fontFamily: "monospace", fontSize: "12px", color: "#f87171" }}>{adWatchError}</p>
                </div>
              )}

              <button
                onClick={handleAdClaim}
                disabled={adWatchCountdown > 0 || adClaimMutation.isPending}
                style={{
                  width: "100%",
                  height: "52px",
                  borderRadius: "14px",
                  border: "none",
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: "14px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: adWatchCountdown === 0 && !adClaimMutation.isPending ? "pointer" : "not-allowed",
                  background: adWatchCountdown === 0 && !adClaimMutation.isPending
                    ? "linear-gradient(135deg, #15803d 0%, #22c55e 100%)"
                    : "rgba(34,197,94,0.08)",
                  color: adWatchCountdown === 0 && !adClaimMutation.isPending
                    ? "#fff"
                    : "rgba(34,197,94,0.3)",
                  boxShadow: adWatchCountdown === 0 && !adClaimMutation.isPending
                    ? "0 0 24px rgba(34,197,94,0.4)"
                    : "none",
                  transition: "all 0.3s ease",
                }}
              >
                {adClaimMutation.isPending ? (
                  <><Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> Sending to blockchain…</>
                ) : adWatchCountdown > 0 ? (
                  <><Clock style={{ width: "16px", height: "16px" }} /> Wait {adWatchCountdown}s to Claim</>
                ) : (
                  <><Zap style={{ width: "16px", height: "16px" }} /> Claim {(chain as any)?.adClaimAmount ?? chain?.claimAmount} {chain?.symbol}</>
                )}
              </button>

              <button
                onClick={() => { setStep("input"); setAdWatchError(""); }}
                style={{
                  width: "100%",
                  height: "40px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
            </div>
          </div>
      )}
    </>
  );
}
