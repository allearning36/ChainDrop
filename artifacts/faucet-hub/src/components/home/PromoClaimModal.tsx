import { useState, useRef, useEffect } from "react";
import { ChainPublic } from "@workspace/api-client-react";
import { Gift, X, Loader2, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReCAPTCHA from "react-google-recaptcha";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

// ── Address helpers ───────────────────────────────────────────────────────────
function isValidAddressForChain(addr: string, chainType: string, addressRegex?: string | null): boolean {
  if (addressRegex) { try { return new RegExp(addressRegex).test(addr); } catch { /* fall through */ } }
  switch (chainType) {
    case "evm":    return /^0x[0-9a-fA-F]{40}$/.test(addr);
    case "solana": return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    case "ton":    return /^[UE][Qq0-9a-zA-Z_\-]{47}$/.test(addr);
    case "sui":    return /^0x[0-9a-fA-F]{64}$/.test(addr);
    case "aptos":  return /^0x[0-9a-fA-F]{64}$/.test(addr);
    default:       return addr.length > 10;
  }
}

function getAddressPlaceholder(chainType: string): string {
  switch (chainType) {
    case "evm":    return "0x...";
    case "solana": return "Sol address…";
    case "ton":    return "UQ… or EQ…";
    case "sui":    return "0x… (64-char)";
    case "aptos":  return "0x… (64-char)";
    default:       return "Your wallet address…";
  }
}

function getTxExplorerUrl(chainType: string, isTestnet: boolean, txHash: string, customExplorerUrl?: string | null): string {
  if (customExplorerUrl) return `${customExplorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
  switch (chainType) {
    case "evm":    return isTestnet ? `https://sepolia.etherscan.io/tx/${txHash}` : `https://etherscan.io/tx/${txHash}`;
    case "solana": return isTestnet ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet` : `https://explorer.solana.com/tx/${txHash}`;
    case "ton":    return isTestnet ? `https://testnet.tonscan.org/tx/${txHash}` : `https://tonscan.org/tx/${txHash}`;
    case "sui":    return isTestnet ? `https://testnet.suivision.xyz/txblock/${txHash}` : `https://suivision.xyz/txblock/${txHash}`;
    case "aptos":  return isTestnet ? `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet` : `https://explorer.aptoslabs.com/txn/${txHash}`;
    default:       return `#`;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PromoInfo {
  active: boolean;
  claimAmount?: string;
  codeLink?: string | null;
  successMessage?: string | null;
  captchaRequired?: boolean;
}

interface ClaimResult {
  txHash: string;
  amount: string;
  explorerUrl: string;
  successMessage: string | null;
}

interface PromoClaimModalProps {
  chain: ChainPublic;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PromoClaimModal({ chain, onClose }: PromoClaimModalProps) {
  const [address, setAddress]         = useState("");
  const [code, setCode]               = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState<ClaimResult | null>(null);
  const [promoInfo, setPromoInfo]     = useState<PromoInfo | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaExpired, setCaptchaExpired] = useState(false);
  const overlayRef                    = useRef<HTMLDivElement>(null);
  const recaptchaRef                  = useRef<ReCAPTCHA>(null);

  const chainType    = (chain as unknown as { chainType?: string }).chainType ?? "evm";
  const addressRegex = (chain as unknown as { addressRegex?: string | null }).addressRegex;
  const addressValid = address.length > 0 && isValidAddressForChain(address.trim(), chainType, addressRegex);
  const codeValid    = code.trim().length >= 3;
  const needsCaptcha = promoInfo?.captchaRequired !== false;
  const canSubmit    = addressValid && codeValid && !loading && (!needsCaptcha || !!captchaToken);

  // Load promo info
  useEffect(() => {
    fetch(`/api/promo/chain/${chain.id}`)
      .then(r => r.json())
      .then((d: PromoInfo) => setPromoInfo(d))
      .catch(() => {});
  }, [chain.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true); setError("");

    try {
      const res = await fetch("/api/promo/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId:      chain.id,
          address:      address.trim(),
          code:         code.trim().toUpperCase(),
          captchaToken: captchaToken || undefined,
        }),
      });
      const data = await res.json() as {
        success?: boolean; txHash?: string; amount?: string;
        explorerUrl?: string; error?: string; successMessage?: string | null;
      };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Claim failed. Please try again.");
        recaptchaRef.current?.reset();
        setCaptchaToken("");
      } else {
        const explorerUrl = data.explorerUrl
          ? `${data.explorerUrl.replace(/\/$/, "")}/tx/${data.txHash}`
          : getTxExplorerUrl(chainType, chain.isTestnet, data.txHash!, chain.explorerUrl);
        setResult({
          txHash:         data.txHash!,
          amount:         data.amount!,
          explorerUrl,
          successMessage: data.successMessage ?? null,
        });
      }
    } catch {
      setError("Network error — please try again.");
      recaptchaRef.current?.reset();
      setCaptchaToken("");
    }
    setLoading(false);
  }

  const codeLink = promoInfo?.codeLink;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(15,15,20,0.98) 0%, rgba(20,12,35,0.98) 100%)",
          border: "1px solid rgba(168,85,247,0.3)",
          boxShadow: "0 0 40px rgba(168,85,247,0.15), 0 25px 50px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header — X button is part of flex row, no absolute overlap */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid rgba(168,85,247,0.15)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)" }}
          >
            <Gift className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-white text-sm leading-tight">Promo Airdrop</h2>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(168,85,247,0.8)" }}>
              {chain.name} · {chain.symbol}
            </p>
          </div>

          {/* Get Code button — 🎁 icon, only if codeLink set */}
          {codeLink && !result && (
            <a
              href={codeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold shrink-0 transition-all hover:opacity-80"
              style={{
                background: "rgba(168,85,247,0.2)",
                border: "1px solid rgba(168,85,247,0.45)",
                color: "#c084fc",
                boxShadow: "0 0 12px rgba(168,85,247,0.2)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <span className="text-sm leading-none">🎁</span>
              <span>Get Code</span>
            </a>
          )}

          {/* Close button — in flow, never overlaps */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white/40 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5">
          {result ? (
            /* ── Success state ── */
            <div className="text-center space-y-4 py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
              >
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">{result.amount} {chain.symbol}</p>
                <p className="text-xs text-muted-foreground mt-0.5">sent to your wallet!</p>
              </div>

              {/* Custom success message — centered */}
              {result.successMessage && (
                <div className="text-xs font-mono text-white/70 bg-white/5 border border-white/10 rounded-lg px-4 py-3 leading-relaxed text-center">
                  {result.successMessage}
                </div>
              )}

              <a
                href={result.explorerUrl}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-green-400 hover:underline"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
              <Button onClick={onClose} size="sm" variant="outline"
                className="w-full font-mono text-xs h-9 mt-2"
                style={{ borderColor: "rgba(168,85,247,0.3)", color: "#c084fc" }}
              >
                Close
              </Button>
            </div>
          ) : (
            /* ── Claim form ── */
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your wallet address and the promo code to receive a free airdrop.
              </p>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Address */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                  {chain.name} Wallet Address
                </label>
                <input
                  className="w-full bg-background border rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none transition-colors"
                  style={{
                    borderColor: address && !addressValid
                      ? "rgba(239,68,68,0.5)"
                      : address && addressValid
                      ? "rgba(34,197,94,0.4)"
                      : "rgba(255,255,255,0.1)",
                  }}
                  placeholder={getAddressPlaceholder(chainType)}
                  value={address}
                  onChange={e => { setAddress(e.target.value); setError(""); }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Promo code */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                  Promo Code
                </label>
                <input
                  className="w-full bg-background border rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none transition-colors uppercase tracking-widest"
                  style={{
                    borderColor: code && !codeValid
                      ? "rgba(239,68,68,0.5)"
                      : code && codeValid
                      ? "rgba(168,85,247,0.4)"
                      : "rgba(255,255,255,0.1)",
                  }}
                  placeholder="ENTER CODE"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* reCAPTCHA */}
              {needsCaptcha && (
                <div className="flex flex-col items-center gap-1">
                  {captchaExpired && (
                    <p className="text-[10px] font-mono text-yellow-400">CAPTCHA expired — please solve again.</p>
                  )}
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={RECAPTCHA_SITE_KEY}
                    theme="dark"
                    size="normal"
                    onChange={token => { setCaptchaToken(token ?? ""); setCaptchaExpired(false); }}
                    onExpired={() => { setCaptchaToken(""); setCaptchaExpired(true); }}
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full font-mono text-sm h-10 mt-1 font-bold transition-all"
                style={{
                  background: canSubmit ? "linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)" : "rgba(168,85,247,0.15)",
                  color: canSubmit ? "white" : "rgba(168,85,247,0.5)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  boxShadow: canSubmit ? "0 0 20px rgba(168,85,247,0.3)" : "none",
                }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming…</>
                ) : (
                  <><Gift className="w-4 h-4 mr-2" /> Claim Airdrop</>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
