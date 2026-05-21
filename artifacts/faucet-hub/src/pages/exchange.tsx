import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WalletSelector } from "@/components/home/WalletSelector";
import {
  ArrowLeftRight, Wallet, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, ArrowRight, ChevronDown, X, RefreshCw,
} from "lucide-react";
function parseEtherToHex(amount: string): string {
  const [intPart = "0", fracPart = ""] = amount.split(".");
  const frac = (fracPart + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(intPart) * BigInt("1000000000000000000") + BigInt(frac);
  return "0x" + wei.toString(16);
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ExchangePair {
  id: number; name: string;
  fromChainName: string; fromSymbol: string; fromChainId: number;
  fromRpcUrl: string; fromExplorerUrl: string | null; fromDepositAddress: string; fromLogoUrl: string | null;
  toChainName: string; toSymbol: string; toChainId: number;
  toRpcUrl: string; toExplorerUrl: string | null; toLogoUrl: string | null;
  feePercent: string; minAmount: string; maxAmount: string; isEnabled: boolean;
}

interface OrderResult {
  orderId: string; depositAddress: string;
  fromAmount: string; feeAmount: string; toAmount: string;
  feePercent: string; fromSymbol: string; toSymbol: string;
  fromChainName: string; toChainName: string; expiresAt: string;
}

interface OrderStatus {
  id: string; status: string; fromTxHash: string | null; toTxHash: string | null; failReason: string | null;
}

type Step = "select" | "review" | "wallet" | "sending" | "confirming" | "success" | "error";

// ─── Chain logo helper ────────────────────────────────────────────────────────
const CHAIN_LOGOS: Record<number, string> = {
  1:     "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  8453:  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  42161: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  10:    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  137:   "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  56:    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
};

function ChainLogo({ pair, side, size = 28 }: { pair: ExchangePair; side: "from" | "to"; size?: number }) {
  const logoUrl = side === "from" ? pair.fromLogoUrl : pair.toLogoUrl;
  const chainId  = side === "from" ? pair.fromChainId : pair.toChainId;
  const src = logoUrl || CHAIN_LOGOS[chainId] || "";
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-white text-xs"
        style={{ width: size, height: size, background: "rgba(255,255,255,0.12)", fontSize: size * 0.35 }}>
        {(side === "from" ? pair.fromSymbol : pair.toSymbol).slice(0, 2)}
      </div>
    );
  }
  return <img src={src} alt="" className="rounded-full shrink-0 object-contain" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExchangePage() {
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [selectedPair, setSelectedPair] = useState<ExchangePair | null>(null);
  const [pairDropdown, setPairDropdown] = useState(false);
  const [fromAmount, setFromAmount] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load pairs
  useEffect(() => {
    fetch("/api/exchange/pairs")
      .then(r => r.json())
      .then((data: ExchangePair[]) => { setPairs(data); if (data.length) setSelectedPair(data[0]); })
      .catch(() => {})
      .finally(() => setLoadingPairs(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setPairDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Poll order status
  useEffect(() => {
    if (!order || (step !== "confirming")) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/exchange/orders/${order.orderId}`);
        const data: OrderStatus = await res.json();
        setOrderStatus(data);
        if (data.status === "completed") { clearInterval(pollRef.current!); setStep("success"); }
        if (data.status === "failed" || data.status === "expired") {
          clearInterval(pollRef.current!);
          setErrorMsg(data.failReason || "Exchange failed. Please try again.");
          setStep("error");
        }
      } catch { /* keep polling */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order, step]);

  const pair = selectedPair;
  const from = parseFloat(fromAmount) || 0;
  const feeAmt = pair ? (from * parseFloat(pair.feePercent)) / 100 : 0;
  const toAmt = from - feeAmt;
  const amountValid = pair && from >= parseFloat(pair.minAmount) && from <= parseFloat(pair.maxAmount);

  const handleWalletConnected = (addr: string, _type: string, provider?: any) => {
    setWalletAddress(addr);
    setWalletProvider(provider || window.ethereum);
    setWalletOpen(false);
    setStep("review");
  };

  const handleInitiateOrder = async () => {
    if (!pair || !walletAddress || !fromAmount) return;
    setStep("sending");
    setErrorMsg("");
    try {
      // Create order
      const res = await fetch("/api/exchange/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairId: pair.id, userAddress: walletAddress, fromAmount }),
      });
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error || "Failed to create order"); }
      const orderData: OrderResult = await res.json();
      setOrder(orderData);

      // Switch network if needed
      const provider = walletProvider || window.ethereum;
      if (provider) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${pair.fromChainId.toString(16)}` }],
          });
        } catch { /* user may reject or chain may already be correct */ }
      }

      // Send transaction
      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: walletAddress,
          to: orderData.depositAddress,
          value: parseEtherToHex(fromAmount),
        }],
      }) as string;

      // Confirm with backend
      await fetch(`/api/exchange/orders/${orderData.orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromTxHash: txHash }),
      });

      setStep("confirming");
    } catch (err: any) {
      const msg = err?.message || "Transaction failed or cancelled.";
      if (msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("denied")) {
        setErrorMsg("Transaction cancelled by user.");
      } else {
        setErrorMsg(msg);
      }
      setStep("error");
    }
  };

  const reset = () => {
    setStep("select"); setFromAmount(""); setOrder(null); setOrderStatus(null);
    setErrorMsg(""); setWalletAddress(""); setWalletProvider(null);
  };

  // ── card container ────────────────────────────────────────────────────────
  const card = (
    <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" style={{ color: "#a78bfa" }} />
          <span className="font-bold font-mono text-sm text-white">Exchange</span>
        </div>
        {step !== "select" && step !== "success" && step !== "error" && (
          <button onClick={reset} className="text-xs font-mono flex items-center gap-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            <X className="w-3 h-3" /> Cancel
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">

        {/* ── SELECT STEP ─────────────────────────────────────────────────── */}
        {(step === "select" || step === "review") && (
          <>
            {/* Pair selector */}
            {loadingPairs ? (
              <div className="flex items-center justify-center py-8 gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm font-mono">Loading pairs…</span>
              </div>
            ) : pairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                <ArrowLeftRight className="w-8 h-8 opacity-30" />
                <p className="text-sm font-mono">No exchange pairs available yet.</p>
              </div>
            ) : (
              <>
                {/* Pair dropdown */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>Exchange Pair</label>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setPairDropdown(v => !v)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {pair && (
                        <>
                          <ChainLogo pair={pair} side="from" size={26} />
                          <span className="font-bold text-sm text-white">{pair.fromSymbol}</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                          <ChainLogo pair={pair} side="to" size={26} />
                          <span className="font-bold text-sm text-white">{pair.toSymbol}</span>
                          <span className="text-xs font-mono ml-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                            ({pair.fromChainName} → {pair.toChainName})
                          </span>
                        </>
                      )}
                      <ChevronDown className="w-4 h-4 ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
                    </button>
                    {pairDropdown && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] rounded-xl overflow-hidden z-50"
                        style={{ background: "rgba(12,15,20,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
                        {pairs.map(p => (
                          <button key={p.id} onClick={() => { setSelectedPair(p); setPairDropdown(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                            style={{ background: selectedPair?.id === p.id ? "rgba(167,139,250,0.08)" : "transparent" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                            onMouseLeave={e => (e.currentTarget.style.background = selectedPair?.id === p.id ? "rgba(167,139,250,0.08)" : "transparent")}
                          >
                            <ChainLogo pair={p} side="from" size={22} />
                            <span className="font-semibold text-sm text-white">{p.fromSymbol}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                            <ChainLogo pair={p} side="to" size={22} />
                            <span className="font-semibold text-sm text-white">{p.toSymbol}</span>
                            <span className="text-xs font-mono ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount input */}
                {pair && (
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>
                      You Send ({pair.fromChainName})
                    </label>
                    <div className="relative">
                      <input
                        type="number" step="0.001" min={pair.minAmount} max={pair.maxAmount}
                        value={fromAmount}
                        onChange={e => setFromAmount(e.target.value)}
                        placeholder={`${pair.minAmount} – ${pair.maxAmount}`}
                        className="w-full h-12 rounded-xl px-4 pr-20 font-mono text-white text-sm outline-none transition-all"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${fromAmount && !amountValid ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
                        }}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <ChainLogo pair={pair} side="from" size={18} />
                        <span className="text-xs font-bold font-mono text-white">{pair.fromSymbol}</span>
                      </div>
                    </div>
                    {fromAmount && !amountValid && (
                      <p className="text-xs font-mono mt-1.5" style={{ color: "#f87171" }}>
                        Amount must be between {pair.minAmount} and {pair.maxAmount} {pair.fromSymbol}
                      </p>
                    )}
                  </div>
                )}

                {/* Breakdown */}
                {pair && from > 0 && amountValid && (
                  <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)" }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>You send</span>
                      <span className="text-sm font-bold font-mono text-white">{from.toFixed(6)} {pair.fromSymbol}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>Fee ({pair.feePercent}%)</span>
                      <span className="text-sm font-mono" style={{ color: "#f87171" }}>−{feeAmt.toFixed(6)} {pair.fromSymbol}</span>
                    </div>
                    <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>You receive</span>
                      <div className="flex items-center gap-1.5">
                        <ChainLogo pair={pair} side="to" size={16} />
                        <span className="text-sm font-bold font-mono" style={{ color: "#a78bfa" }}>{toAmt.toFixed(6)} {pair.toSymbol}</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-center pt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                      Sent to your connected wallet on {pair.toChainName}
                    </p>
                  </div>
                )}

                {/* Wallet & Swap */}
                {pair && (
                  step === "review" ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                        <Wallet className="w-4 h-4 shrink-0" style={{ color: "#22c55e" }} />
                        <span className="text-xs font-mono text-white truncate">{walletAddress}</span>
                      </div>
                      <button
                        onClick={handleInitiateOrder}
                        disabled={!amountValid}
                        className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: amountValid ? "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)" : "rgba(124,58,237,0.1)",
                          color: amountValid ? "white" : "rgba(255,255,255,0.3)",
                          boxShadow: amountValid ? "0 0 20px rgba(124,58,237,0.3)" : "none",
                          cursor: amountValid ? "pointer" : "not-allowed",
                        }}
                      >
                        <ArrowLeftRight className="w-4 h-4" /> Swap Now
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setWalletOpen(true)}
                      disabled={!amountValid}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                      style={{
                        background: amountValid ? "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)" : "rgba(124,58,237,0.1)",
                        color: amountValid ? "white" : "rgba(255,255,255,0.3)",
                        boxShadow: amountValid ? "0 0 20px rgba(124,58,237,0.3)" : "none",
                        cursor: amountValid ? "pointer" : "not-allowed",
                      }}
                    >
                      <Wallet className="w-4 h-4" /> Connect Wallet to Swap
                    </button>
                  )
                )}
              </>
            )}
          </>
        )}

        {/* ── SENDING STEP ────────────────────────────────────────────────── */}
        {step === "sending" && (
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)" }}>
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#7c3aed" }} />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-white font-mono">Confirm in Wallet</p>
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Approve the transaction in your wallet app…</p>
            </div>
          </div>
        )}

        {/* ── CONFIRMING STEP ─────────────────────────────────────────────── */}
        {step === "confirming" && order && (
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(167,139,250,0.15)" }} />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" style={{ animationDuration: "1s" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <ArrowLeftRight className="w-6 h-6" style={{ color: "#a78bfa" }} />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-white font-mono">Processing Swap</p>
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Verifying your transaction on-chain…</p>
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>Once confirmed, {order.toAmount} {order.toSymbol} will be sent to your wallet.</p>
            </div>
            <div className="w-full rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex justify-between">
                <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Sending</span>
                <span className="text-[11px] font-mono text-white">{order.fromAmount} {order.fromSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>You receive</span>
                <span className="text-[11px] font-mono" style={{ color: "#a78bfa" }}>{order.toAmount} {order.toSymbol}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS STEP ────────────────────────────────────────────────── */}
        {step === "success" && order && orderStatus && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-white font-mono text-lg">Swap Complete!</p>
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {order.toAmount} {order.toSymbol} sent to your wallet.
              </p>
            </div>
            {orderStatus.toTxHash && pair?.toExplorerUrl && (
              <a href={`${pair.toExplorerUrl}/tx/${orderStatus.toTxHash}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono transition-colors"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
                <ExternalLink className="w-3.5 h-3.5" /> View on Explorer
              </a>
            )}
            <button onClick={reset} className="flex items-center gap-2 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <RefreshCw className="w-3.5 h-3.5" /> New Swap
            </button>
          </div>
        )}

        {/* ── ERROR STEP ──────────────────────────────────────────────────── */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertCircle className="w-8 h-8" style={{ color: "#f87171" }} />
            </div>
            <div className="text-center space-y-2">
              <p className="font-bold text-white font-mono">Swap Failed</p>
              <p className="text-xs font-mono px-4" style={{ color: "rgba(255,255,255,0.5)" }}>{errorMsg}</p>
            </div>
            <button onClick={reset}
              className="w-full h-11 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)", color: "white" }}>
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#080a0e" }}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        {/* Page title */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
            <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Exchange</span>
          </div>
          <h1 className="text-2xl font-black font-mono text-white">Currency Swap</h1>
          <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Swap mainnet tokens across chains instantly
          </p>
        </div>

        {card}

        <p className="text-center text-xs font-mono mt-6" style={{ color: "rgba(255,255,255,0.2)" }}>
          Swaps are processed automatically · No manual steps required
        </p>
      </main>
      <Footer />

      <WalletSelector
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onConnected={handleWalletConnected}
        targetChainId={pair?.fromChainId}
      />
    </div>
  );
}
