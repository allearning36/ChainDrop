import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WalletSelector } from "@/components/home/WalletSelector";
import {
  ArrowLeftRight, Wallet, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, ChevronDown, X, RefreshCw, ArrowLeft, Search, LogOut,
} from "lucide-react";

const WALLET_STORAGE_KEY = "chaindrop_exchange_wallet";

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

// ─── Chain key for dedup ──────────────────────────────────────────────────────
interface ChainOption {
  key: string;
  chainId: number;
  chainName: string;
  symbol: string;
  logoUrl: string | null;
  side: "from" | "to";
}

// ─── Static fallback logos ────────────────────────────────────────────────────
const CHAIN_LOGOS: Record<number, string> = {
  1:     "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  8453:  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  42161: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  10:    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  137:   "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  56:    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
  11155111: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
};

function TokenLogo({ logoUrl, chainId, symbol, size = 32 }: { logoUrl: string | null; chainId: number; symbol: string; size?: number }) {
  const src = logoUrl || CHAIN_LOGOS[chainId] || "";
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-white"
        style={{ width: size, height: size, background: "rgba(167,139,250,0.2)", fontSize: size * 0.35 }}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return <img src={src} alt={symbol} className="rounded-full shrink-0 object-contain"
    style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}

// ─── Chain Picker Modal ───────────────────────────────────────────────────────
function ChainPickerModal({
  options, selected, onSelect, onClose, title,
}: {
  options: ChainOption[];
  selected: ChainOption | null;
  onSelect: (o: ChainOption) => void;
  onClose: () => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = options.filter(o =>
    o.chainName.toLowerCase().includes(search.toLowerCase()) ||
    o.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "rgba(10,12,18,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}
        onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="font-bold text-white text-sm">{title}</span>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "white")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
            <input
              type="text"
              inputMode="none"
              placeholder="Search chain or token…"
              value={search}
              onFocus={e => { (e.target as HTMLInputElement).removeAttribute("inputMode"); }}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-white font-mono placeholder:text-white/30"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm font-mono"
              style={{ color: "rgba(255,255,255,0.3)" }}>No results</div>
          ) : filtered.map(o => {
            const isSelected = selected?.key === o.key;
            return (
              <button key={o.key} onClick={() => { onSelect(o); onClose(); }}
                className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors"
                style={{ background: isSelected ? "rgba(167,139,250,0.1)" : "transparent" }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "rgba(167,139,250,0.1)" : "transparent"; }}>
                <TokenLogo logoUrl={o.logoUrl} chainId={o.chainId} symbol={o.symbol} size={36} />
                <div className="flex flex-col items-start min-w-0">
                  <span className="font-bold text-sm text-white">{o.symbol}</span>
                  <span className="text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{o.chainName}</span>
                </div>
                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" style={{ color: "#a78bfa" }} />
                )}
              </button>
            );
          })}
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}

// ─── Chain Selector Button ────────────────────────────────────────────────────
function ChainSelectorBtn({ option, placeholder, onClick }: {
  option: ChainOption | null;
  placeholder: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        height: "52px",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}>
      {option ? (
        <>
          <TokenLogo logoUrl={option.logoUrl} chainId={option.chainId} symbol={option.symbol} size={28} />
          <div className="flex flex-col items-start min-w-0 flex-1 overflow-hidden">
            <span className="font-bold text-sm text-white leading-tight">{option.symbol}</span>
            <span className="text-[10px] font-mono truncate w-full text-left" style={{ color: "rgba(255,255,255,0.4)" }}>{option.chainName}</span>
          </div>
        </>
      ) : (
        <span className="text-xs font-mono flex-1 text-left truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{placeholder}</span>
      )}
      <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExchangePage() {
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);

  // Selected chain options
  const [fromOption, setFromOption] = useState<ChainOption | null>(null);
  const [toOption, setToOption] = useState<ChainOption | null>(null);

  // Picker modal open
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);

  const [fromAmount, setFromAmount] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [exchangeBalance, setExchangeBalance] = useState<{ balance: string | null; warning: boolean } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load pairs
  useEffect(() => {
    fetch("/api/exchange/pairs")
      .then(r => r.json())
      .then((data: ExchangePair[]) => {
        setPairs(data);
        if (data.length > 0) {
          const p = data[0];
          setFromOption(pairToOption(p, "from"));
          setToOption(pairToOption(p, "to"));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPairs(false));
  }, []);

  // Poll order status
  useEffect(() => {
    if (!order || step !== "confirming") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/exchange/orders/${order.orderId}`);
        const data: OrderStatus = await res.json();
        setOrderStatus(data);
        if (data.status === "completed") { clearInterval(pollRef.current!); setStep("success"); }
        if (data.status === "failed" || data.status === "expired") {
          clearInterval(pollRef.current!);
          setErrorMsg(data.failReason || "Exchange failed.");
          setStep("error");
        }
      } catch { /* keep polling */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order, step]);

  // ─── Derived options ───────────────────────────────────────────────────────
  function pairToOption(p: ExchangePair, side: "from" | "to"): ChainOption {
    if (side === "from") return {
      key: `${p.fromChainId}:${p.fromSymbol}`,
      chainId: p.fromChainId, chainName: p.fromChainName,
      symbol: p.fromSymbol, logoUrl: p.fromLogoUrl, side: "from",
    };
    return {
      key: `${p.toChainId}:${p.toSymbol}`,
      chainId: p.toChainId, chainName: p.toChainName,
      symbol: p.toSymbol, logoUrl: p.toLogoUrl, side: "to",
    };
  }

  // All unique "from" options
  const fromOptions: ChainOption[] = [];
  const seenFrom = new Set<string>();
  for (const p of pairs) {
    const o = pairToOption(p, "from");
    if (!seenFrom.has(o.key)) { seenFrom.add(o.key); fromOptions.push(o); }
  }

  // "to" options filtered by selected "from"
  const toOptions: ChainOption[] = [];
  const seenTo = new Set<string>();
  for (const p of pairs) {
    if (fromOption && pairToOption(p, "from").key !== fromOption.key) continue;
    const o = pairToOption(p, "to");
    if (!seenTo.has(o.key)) { seenTo.add(o.key); toOptions.push(o); }
  }

  // Resolve current pair
  const selectedPair: ExchangePair | null = (fromOption && toOption)
    ? (pairs.find(p =>
        pairToOption(p, "from").key === fromOption.key &&
        pairToOption(p, "to").key === toOption.key
      ) ?? null)
    : null;

  // If fromOption changes and current toOption is no longer valid, reset toOption
  const toOptionIsValid = toOption && toOptions.some(o => o.key === toOption.key);

  const pair = selectedPair;

  // Fetch exchange wallet balance when pair changes (low-balance warning for users)
  useEffect(() => {
    if (!pair) { setExchangeBalance(null); return; }
    fetch(`/api/exchange/pairs/${pair.id}/wallet-balance`)
      .then(r => r.json())
      .then((d: any) => setExchangeBalance({ balance: d.balance ?? null, warning: !!d.warning }))
      .catch(() => setExchangeBalance(null));
  }, [pair?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = parseFloat(fromAmount) || 0;
  const feeAmt = pair ? (from * parseFloat(pair.feePercent)) / 100 : 0;
  const toAmt = from - feeAmt;
  const amountValid = pair && from >= parseFloat(pair.minAmount) && from <= parseFloat(pair.maxAmount);

  // Handle from selection
  const handleFromSelect = (o: ChainOption) => {
    setFromOption(o);
    // Check if current toOption still valid for new from
    const newToOptions: ChainOption[] = [];
    const seen = new Set<string>();
    for (const p of pairs) {
      if (pairToOption(p, "from").key !== o.key) continue;
      const to = pairToOption(p, "to");
      if (!seen.has(to.key)) { seen.add(to.key); newToOptions.push(to); }
    }
    const stillValid = toOption && newToOptions.some(t => t.key === toOption.key);
    if (!stillValid) setToOption(newToOptions[0] ?? null);
    setFromAmount("");
  };

  // Handle swap direction toggle — always swap visually, pair validation happens in render
  const handleSwapDirection = () => {
    if (!fromOption || !toOption) return;
    const prevFrom = fromOption;
    const prevTo = toOption;
    // Try to find exact reverse pair first
    const reversePair = pairs.find(p =>
      pairToOption(p, "from").key === prevTo.key &&
      pairToOption(p, "to").key === prevFrom.key
    );
    if (reversePair) {
      setFromOption(pairToOption(reversePair, "from"));
      setToOption(pairToOption(reversePair, "to"));
    } else {
      // Swap visually even without a matching pair — show "no route" message
      setFromOption({ ...prevTo, side: "from" });
      setToOption({ ...prevFrom, side: "to" });
    }
    setFromAmount("");
  };

  const canSwapDirection = !!(fromOption && toOption);

  // Restore wallet from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WALLET_STORAGE_KEY);
      if (!saved) return;
      const { address, type } = JSON.parse(saved) as { address: string; type: string };
      if (!address) return;
      if (type === "injected" && window.ethereum) {
        (window.ethereum as any).request({ method: "eth_accounts" })
          .then((accounts: string[]) => {
            const match = accounts.find(a => a.toLowerCase() === address.toLowerCase());
            if (match) {
              setWalletAddress(match);
              setWalletProvider(window.ethereum);
            } else {
              localStorage.removeItem(WALLET_STORAGE_KEY);
            }
          })
          .catch(() => localStorage.removeItem(WALLET_STORAGE_KEY));
      } else {
        // WalletConnect session — restore address optimistically; tx will fail if actually disconnected
        setWalletAddress(address);
      }
    } catch {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
  }, []);

  const handleDisconnect = () => {
    setWalletAddress("");
    setWalletProvider(null);
    setUserBalance(null);
    localStorage.removeItem(WALLET_STORAGE_KEY);
    if (step !== "select") setStep("select");
  };

  const handleWalletConnected = (addr: string, type: string, provider?: any) => {
    setWalletAddress(addr);
    const prov = provider || window.ethereum;
    setWalletProvider(prov);
    setWalletOpen(false);
    setStep("select");
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ address: addr, type }));
    // Fetch user balance from fromChain RPC
    setUserBalance(null);
    if (pair) {
      fetch(pair.fromRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
      })
        .then(r => r.json())
        .then((d: any) => {
          if (d.result) {
            const wei = BigInt(d.result);
            const eth = Number(wei) / 1e18;
            setUserBalance(eth.toFixed(6));
          }
        })
        .catch(() => setUserBalance(null));
    }
  };

  const handleInitiateOrder = async () => {
    if (!pair || !walletAddress || !fromAmount) return;
    setStep("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/exchange/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairId: pair.id, userAddress: walletAddress, fromAmount }),
      });
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error || "Failed to create order"); }
      const orderData: OrderResult = await res.json();
      setOrder(orderData);

      const provider = walletProvider || window.ethereum;
      if (provider) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${pair.fromChainId.toString(16)}` }],
          });
        } catch { /* user may reject */ }
      }

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: orderData.depositAddress, value: parseEtherToHex(fromAmount) }],
      }) as string;

      await fetch(`/api/exchange/orders/${orderData.orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromTxHash: txHash }),
      });

      setStep("confirming");
    } catch (err: any) {
      const msg = err?.message || "Transaction failed or cancelled.";
      setErrorMsg(msg.includes("rejected") || msg.includes("denied") ? "Transaction cancelled." : msg);
      setStep("error");
    }
  };

  const reset = () => {
    // wallet stays connected — only swap state is cleared
    setStep("select"); setFromAmount(""); setOrder(null); setOrderStatus(null);
    setErrorMsg("");
  };

  // ── card ──────────────────────────────────────────────────────────────────
  const card = (
    <div className="max-w-[460px] mx-auto rounded-2xl overflow-visible"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" style={{ color: "#a78bfa" }} />
          <span className="font-bold font-mono text-sm text-white">Exchange</span>
        </div>
        {step !== "select" && step !== "success" && step !== "error" && (
          <button onClick={reset} className="text-xs font-mono flex items-center gap-1 transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "white")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
            <X className="w-3 h-3" /> Cancel
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">

        {/* ── SELECT / REVIEW STEP ────────────────────────────────────────── */}
        {(step === "select" || step === "review") && (
          <>
            {loadingPairs ? (
              <div className="flex items-center justify-center py-12 gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-mono">Loading…</span>
              </div>
            ) : pairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                <ArrowLeftRight className="w-8 h-8 opacity-30" />
                <p className="text-sm font-mono">No exchange pairs available yet.</p>
              </div>
            ) : (
              <>
                {/* ── Chain selector row ─────────────────────────────────── */}
                <div>
                  <div className="grid items-end gap-2" style={{ gridTemplateColumns: "1fr 40px 1fr" }}>
                    {/* From */}
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>From</p>
                      <ChainSelectorBtn
                        option={fromOption}
                        placeholder="Select chain"
                        onClick={() => step === "select" && setFromPickerOpen(true)}
                      />
                    </div>

                    {/* Swap direction button — centered in fixed 40px column */}
                    <div className="flex items-center justify-center" style={{ height: "52px" }}>
                      <button
                        onClick={handleSwapDirection}
                        disabled={!canSwapDirection}
                        title={canSwapDirection ? "Swap direction" : "Reverse pair not available"}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0"
                        style={{
                          background: canSwapDirection ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${canSwapDirection ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.07)"}`,
                          color: canSwapDirection ? "#a78bfa" : "rgba(255,255,255,0.2)",
                          cursor: canSwapDirection ? "pointer" : "default",
                        }}>
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* To */}
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>To</p>
                      <ChainSelectorBtn
                        option={toOptionIsValid ? toOption : null}
                        placeholder="Select chain"
                        onClick={() => step === "select" && fromOption && setToPickerOpen(true)}
                      />
                    </div>
                  </div>

                  {/* Pair not found hint */}
                  {fromOption && toOption && !toOptionIsValid && (
                    <p className="text-xs font-mono mt-2 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Select a destination chain
                    </p>
                  )}
                  {fromOption && toOption && toOptionIsValid && !selectedPair && (
                    <p className="text-xs font-mono mt-2 text-center" style={{ color: "#f87171" }}>
                      No route for this pair
                    </p>
                  )}
                </div>

                {/* ── Amount input ───────────────────────────────────────── */}
                {pair && (
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>
                      You Send
                    </label>
                    <div className="relative">
                      <input
                        type="number" step="0.001" min={pair.minAmount} max={pair.maxAmount}
                        value={fromAmount}
                        onChange={e => setFromAmount(e.target.value)}
                        placeholder={`${pair.minAmount} – ${pair.maxAmount}`}
                        disabled={step === "review"}
                        className="w-full h-14 rounded-xl px-4 pr-28 font-mono text-white text-base outline-none transition-all"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${fromAmount && !amountValid ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
                        }}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                        <TokenLogo logoUrl={pair.fromLogoUrl} chainId={pair.fromChainId} symbol={pair.fromSymbol} size={20} />
                        <span className="text-sm font-bold font-mono text-white">{pair.fromSymbol}</span>
                      </div>
                    </div>
                    {fromAmount && !amountValid && (
                      <p className="text-xs font-mono mt-1.5" style={{ color: "#f87171" }}>
                        {pair.minAmount} – {pair.maxAmount} {pair.fromSymbol}
                      </p>
                    )}
                  </div>
                )}

                {/* ── You Receive display ────────────────────────────────── */}
                {pair && from > 0 && amountValid && (
                  <div className="rounded-xl px-4 py-3 space-y-2.5" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)" }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.45)" }}>Fee ({pair.feePercent}%)</span>
                      <span className="text-xs font-mono" style={{ color: "#f87171" }}>−{feeAmt.toFixed(6)} {pair.fromSymbol}</span>
                    </div>
                    <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.45)" }}>You receive</span>
                      <div className="flex items-center gap-1.5">
                        <TokenLogo logoUrl={pair.toLogoUrl} chainId={pair.toChainId} symbol={pair.toSymbol} size={17} />
                        <span className="text-base font-bold font-mono" style={{ color: "#a78bfa" }}>
                          {toAmt.toFixed(6)} <span style={{ color: "rgba(167,139,250,0.7)" }}>{pair.toSymbol}</span>
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Delivered to your wallet on {pair.toChainName}
                    </p>
                  </div>
                )}

                {/* ── Exchange wallet balance warning (blocking) ─────────── */}
                {pair && exchangeBalance?.warning && (
                  <div className="rounded-xl overflow-hidden"
                    style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#f87171" }} />
                      <span className="text-xs font-mono font-bold" style={{ color: "#f87171" }}>Swaps Unavailable</span>
                    </div>
                    <div className="px-3 py-2.5 text-xs font-mono" style={{ background: "rgba(239,68,68,0.05)", color: "rgba(255,255,255,0.6)" }}>
                      {exchangeBalance.balance !== null && parseFloat(exchangeBalance.balance) === 0
                        ? `The exchange wallet has 0 ${pair.toSymbol} on ${pair.toChainName}. Cannot process swaps.`
                        : exchangeBalance.balance !== null
                        ? `Exchange wallet balance too low: ${parseFloat(exchangeBalance.balance).toFixed(6)} ${pair.toSymbol} on ${pair.toChainName}.`
                        : `Cannot reach the ${pair.toChainName} network to verify exchange wallet. Please try again later.`
                      }
                    </div>
                  </div>
                )}

                {/* ── Wallet chip (always visible when connected) ────────── */}
                {walletAddress && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <Wallet className="w-4 h-4 shrink-0" style={{ color: "#22c55e" }} />
                    <span className="text-xs font-mono text-white truncate flex-1 min-w-0">{walletAddress}</span>
                    {userBalance !== null && pair && (
                      <span className="text-xs font-mono shrink-0" style={{ color: "rgba(34,197,94,0.7)" }}>
                        {userBalance} {pair.fromSymbol}
                      </span>
                    )}
                    <button
                      onClick={handleDisconnect}
                      title="Disconnect wallet"
                      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono transition-all"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "rgba(239,100,100,0.8)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "rgba(239,100,100,0.8)"; }}>
                      <LogOut className="w-3 h-3" /> Disconnect
                    </button>
                  </div>
                )}

                {/* ── Swap / Connect button ──────────────────────────────── */}
                {(() => {
                  const swapBlocked = !!(pair && exchangeBalance?.warning);
                  const btnDisabled = !amountValid || swapBlocked;
                  const btnStyle = {
                    background: btnDisabled ? "rgba(124,58,237,0.06)" : "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
                    color: btnDisabled ? "rgba(255,255,255,0.2)" : "white",
                    boxShadow: btnDisabled ? "none" : "0 0 24px rgba(124,58,237,0.3)",
                    cursor: btnDisabled ? "not-allowed" : "pointer",
                  };
                  if (pair && walletAddress) return (
                    <button onClick={handleInitiateOrder} disabled={btnDisabled}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                      style={btnStyle}>
                      <ArrowLeftRight className="w-4 h-4" /> Swap Now
                    </button>
                  );
                  if (pair) return (
                    <button onClick={() => !btnDisabled && setWalletOpen(true)} disabled={btnDisabled}
                      className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                      style={btnStyle}>
                      <Wallet className="w-4 h-4" /> Connect Wallet to Swap
                    </button>
                  );
                  return null;
                })()}
              </>
            )}
          </>
        )}

        {/* ── SENDING ──────────────────────────────────────────────────────── */}
        {step === "sending" && (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)" }}>
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#7c3aed" }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-white font-mono">Confirm in Wallet</p>
              <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Approve the transaction in your wallet…</p>
            </div>
          </div>
        )}

        {/* ── CONFIRMING ───────────────────────────────────────────────────── */}
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
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Verifying on-chain…</p>
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                {order.toAmount} {order.toSymbol} will be sent once confirmed.
              </p>
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

        {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
        {step === "success" && order && orderStatus && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-white font-mono text-lg">Swap Complete!</p>
              <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                {order.toAmount} {order.toSymbol} sent to your wallet.
              </p>
            </div>
            {orderStatus.toTxHash && pair?.toExplorerUrl && (
              <a href={`${pair.toExplorerUrl}/tx/${orderStatus.toTxHash}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono transition-colors"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
                <ExternalLink className="w-3.5 h-3.5" /> View on Explorer
              </a>
            )}
            <button onClick={reset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-mono transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              <RefreshCw className="w-3.5 h-3.5" /> New Swap
            </button>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertCircle className="w-8 h-8" style={{ color: "#f87171" }} />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-white font-mono">Swap Failed</p>
              <p className="text-xs font-mono max-w-xs text-center" style={{ color: "rgba(255,255,255,0.5)" }}>{errorMsg}</p>
            </div>
            <button onClick={reset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-mono transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0c12" }}>
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-start pt-12 pb-20 px-4">

        {/* Back link */}
        <div className="w-full max-w-[460px] mb-5">
          <a href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "white")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </a>
        </div>

        {/* Title */}
        <div className="w-full max-w-[460px] mb-6">
          <h1 className="text-2xl font-bold text-white">Cross-Chain Swap</h1>
          <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Swap tokens across chains instantly
          </p>
        </div>

        {card}

      </main>

      {/* Chain picker modals */}
      {fromPickerOpen && (
        <ChainPickerModal
          options={fromOptions}
          selected={fromOption}
          onSelect={handleFromSelect}
          onClose={() => setFromPickerOpen(false)}
          title="Select Source Chain"
        />
      )}
      {toPickerOpen && (
        <ChainPickerModal
          options={toOptions}
          selected={toOptionIsValid ? toOption : null}
          onSelect={o => setToOption(o)}
          onClose={() => setToPickerOpen(false)}
          title="Select Destination Chain"
        />
      )}

      {walletOpen && (
        <WalletSelector
          open={walletOpen}
          onClose={() => setWalletOpen(false)}
          onConnected={handleWalletConnected}
        />
      )}

      <Footer />
    </div>
  );
}
