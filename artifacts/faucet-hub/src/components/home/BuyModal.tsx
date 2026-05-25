import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ChainPublic, useGetBuyInfo, useSubmitBuy,
  getGetBuyInfoQueryKey, PaymentNetwork,
} from "@workspace/api-client-react";
import {
  Loader2, X, Wallet, CheckCircle2, Copy, Check,
  AlertCircle, ExternalLink, ArrowLeftRight, Zap, ChevronDown, Radio, ArrowRight, History,
} from "lucide-react";
import { WalletSelector } from "./WalletSelector";
import { HistoryModal } from "./HistoryModal";

interface BuyModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

type Step = "info" | "sending" | "confirming" | "submitting" | "success" | "error";

const NETWORK_LOGOS: Record<string, string> = {
  eth:      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  base:     "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  arbitrum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  optimism: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  polygon:  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
};

const NETWORK_COLORS: Record<string, string> = {
  eth:      "#627EEA",
  base:     "#0052FF",
  arbitrum: "#28A0F0",
  optimism: "#FF0420",
  polygon:  "#8247E5",
};

const NETWORK_RPC: Record<string, string> = {
  eth:      "https://eth.llamarpc.com",
  base:     "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
  polygon:  "https://polygon-rpc.com",
};

async function fetchWalletBalance(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    });
    const json = await res.json() as { result?: string };
    if (!json.result) return null;
    const eth = Number(BigInt(json.result)) / 1e18;
    return eth.toFixed(6);
  } catch {
    return null;
  }
}

/** Poll for tx receipt via JSON-RPC. Returns true=success, false=reverted, null=timeout */
async function waitForReceipt(
  rpcUrl: string,
  txHash: string,
  signal: AbortSignal,
  intervalMs = 3000,
  maxAttempts = 60,
): Promise<boolean | null> {
  for (let i = 0; i < maxAttempts; i++) {
    if (signal.aborted) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal.aborted) return null;
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
        signal,
      });
      const json = await res.json() as { result?: { status: string; blockNumber: string } | null };
      if (json.result?.blockNumber) {
        return json.result.status === "0x1";
      }
    } catch { /* keep polling */ }
  }
  return null;
}

export function BuyModal({ chain, onClose }: BuyModalProps) {
  const [step, setStep] = useState<Step>("info");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletProvider, setWalletProvider] = useState<any>(null); // injected or WC provider
  const [ethAmount, setEthAmount] = useState("0.01");
  const [selectedNetwork, setSelectedNetwork] = useState<PaymentNetwork | null>(null);
  const [networkDropdown, setNetworkDropdown] = useState(false);
  const [mainnetTxHash, setMainnetTxHash] = useState("");
  const [testnetTxHash, setTestnetTxHash] = useState("");
  const [testnetAmountSent, setTestnetAmountSent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<"addr" | "tx" | null>(null);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDots, setConfirmDots] = useState(0);
  const [sendingSeconds, setSendingSeconds] = useState(0);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const submitBuy = useSubmitBuy();

  const { data: buyInfo, isLoading: infoLoading, error: infoError } = useGetBuyInfo(
    chain?.id || 0,
    { query: { enabled: !!chain?.id && !!chain?.buyEnabled, queryKey: getGetBuyInfoQueryKey(chain?.id || 0) } }
  );

  useEffect(() => {
    if (buyInfo?.networks?.length && !selectedNetwork) setSelectedNetwork(buyInfo.networks[0]);
  }, [buyInfo?.networks, selectedNetwork]);

  useEffect(() => {
    if (step !== "confirming") return;
    const id = setInterval(() => setConfirmDots((d) => (d + 1) % 4), 600);
    return () => clearInterval(id);
  }, [step]);

  // Count how long we're stuck in "sending" — WalletConnect mobile can drop the response
  useEffect(() => {
    if (step !== "sending") { setSendingSeconds(0); setRecoveryHash(""); return; }
    const id = setInterval(() => setSendingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Fetch wallet balance when wallet or network changes
  useEffect(() => {
    if (!walletAddress || !selectedNetwork) { setWalletBalance(null); return; }
    const rpcUrl = NETWORK_RPC[selectedNetwork.id] ?? (selectedNetwork as any).rpcUrl as string | undefined;
    if (!rpcUrl) { setWalletBalance(null); return; }
    setIsFetchingBalance(true);
    setWalletBalance(null);
    fetchWalletBalance(rpcUrl, walletAddress).then((bal) => {
      setWalletBalance(bal);
      setIsFetchingBalance(false);
    });
  }, [walletAddress, selectedNetwork?.id]);

  useEffect(() => {
    if (!chain) {
      abortRef.current?.abort();
      setStep("info"); setWalletAddress(""); setEthAmount("0.01");
      setMainnetTxHash(""); setErrorMsg(""); setSelectedNetwork(null);
      setWalletProvider(null); setConfirmDots(0); setSendingSeconds(0); setRecoveryHash("");
      setWalletBalance(null); setIsFetchingBalance(false);
    }
  }, [chain]);

  // Recovery for WalletConnect mobile: tx was signed but response never came back
  const handleRecoveryHashSubmit = () => {
    const hash = recoveryHash.trim();
    if (!hash || !hash.startsWith("0x") || hash.length < 60 || !selectedNetwork) return;
    setMainnetTxHash(hash);
    setStep("confirming");
    const abort = new AbortController();
    abortRef.current = abort;
    const rpcUrl = NETWORK_RPC[selectedNetwork.id] || "https://eth.llamarpc.com";
    waitForReceipt(rpcUrl, hash, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      if (result === null) {
        setErrorMsg("Transaction not found on-chain after 3 minutes. If you paid, contact support with your tx hash.");
        setStep("error");
        return;
      }
      if (result === false) {
        setErrorMsg("Transaction was reverted on-chain. Your ETH may have been refunded by the network.");
        setStep("error");
        return;
      }
      setStep("submitting");
      doSubmitBuy(hash);
    });
  };

  if (!chain || !chain.buyEnabled) return null;

  const receiveAddress = buyInfo?.receiveAddress || "";
  const buyRate = parseFloat(buyInfo?.buyRate || "1000");
  const minAmount = parseFloat(buyInfo?.minAmount || "0.0005");
  const ethAmountNum = parseFloat(ethAmount) || 0;
  const willReceive = (ethAmountNum * buyRate).toFixed(8);
  const amountValid = ethAmountNum >= minAmount;

  const netColor = selectedNetwork ? (NETWORK_COLORS[selectedNetwork.id] || "#818cf8") : "#818cf8";
  const netLogo = selectedNetwork ? (NETWORK_LOGOS[selectedNetwork.id] || "") : "";
  const dots = ".".repeat(confirmDots);

  // Called when WalletSelector successfully connects
  const handleWalletConnected = (address: string, type: "injected" | "walletconnect", provider?: any) => {
    setWalletAddress(address);
    // For WalletConnect, store the provider; for injected, use window.ethereum
    setWalletProvider(type === "walletconnect" ? provider : window.ethereum);
    setWalletSelectorOpen(false);
  };

  const activeProvider = walletProvider || window.ethereum;

  /** Parse any chainId format (number, hex string, "eip155:X") to lowercase hex */
  const parseChainHex = (chainId: unknown): string => {
    if (typeof chainId === "number") return "0x" + chainId.toString(16);
    const raw = String(chainId);
    const numeric = raw.includes(":") ? raw.split(":").pop()! : raw;
    if (numeric.startsWith("0x")) return numeric.toLowerCase();
    return "0x" + parseInt(numeric, 10).toString(16);
  };

  const sendEth = async () => {
    if (!activeProvider || !walletAddress || !receiveAddress || !amountValid || !selectedNetwork) return;
    setStep("sending");
    setErrorMsg("");

    const targetChainHex = "0x" + selectedNetwork.chainId.toString(16);

    // Check current chain
    let currentChainHex: string = "0x1";
    try {
      const chainId = await activeProvider.request({ method: "eth_chainId" });
      currentChainHex = parseChainHex(chainId);
    } catch { /* ignore */ }

    // Switch chain if needed
    if (currentChainHex.toLowerCase() !== targetChainHex.toLowerCase()) {
      let switched = false;
      try {
        await activeProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetChainHex }],
        });
        // Verify the switch actually happened
        try {
          const newId = await activeProvider.request({ method: "eth_chainId" });
          switched = parseChainHex(newId).toLowerCase() === targetChainHex.toLowerCase();
        } catch { switched = true; /* assume ok */ }
      } catch (switchErr: any) {
        const code = switchErr?.code;
        const msg = String(switchErr?.message || "");
        // Chain not added in wallet — try wallet_addEthereumChain
        if (code === 4902 || msg.includes("Unrecognized") || msg.includes("wallet_addEthereumChain")) {
          try {
            await activeProvider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: targetChainHex,
                chainName: selectedNetwork.name,
                rpcUrls: [NETWORK_RPC[selectedNetwork.id] || ""],
              }],
            });
            switched = true;
          } catch { /* ignore, let eth_sendTransaction fail naturally */ }
        }
        // For all other errors (including WalletConnect eip155 errors): show friendly message
        if (!switched) {
          setErrorMsg(`Please switch to ${selectedNetwork.name} network in your wallet, then tap Send again.`);
          setStep("info");
          return;
        }
      }

      // If switch didn't take effect, warn and abort
      if (!switched) {
        setErrorMsg(`Please switch to ${selectedNetwork.name} network in your wallet, then tap Send again.`);
        setStep("info");
        return;
      }
    }

    let txHash: string;
    try {
      const amountWei = BigInt(Math.round(ethAmountNum * 1e18));
      txHash = await activeProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: receiveAddress, value: "0x" + amountWei.toString(16) }],
      }) as string;
    } catch (err: any) {
      const msg = String(err?.message || "");
      const code = err?.code;
      if (code === 4001 || msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setErrorMsg("Transaction rejected by user.");
      } else if (msg.includes("eip155") || msg.includes("Missing or invalid") || msg.toLowerCase().includes("chain")) {
        setErrorMsg(`Wrong network. Please switch to ${selectedNetwork.name} in your wallet and try again.`);
      } else {
        setErrorMsg(msg || "Transaction failed. Please try again.");
      }
      setStep("info");
      return;
    }

    setMainnetTxHash(txHash);
    setStep("confirming");

    const abort = new AbortController();
    abortRef.current = abort;
    const rpcUrl = NETWORK_RPC[selectedNetwork.id] || "https://eth.llamarpc.com";
    const result = await waitForReceipt(rpcUrl, txHash, abort.signal);

    if (abort.signal.aborted) return;

    if (result === null) {
      setErrorMsg("Transaction not confirmed within 3 minutes. Use the manual submit below.");
      setStep("error");
      return;
    }
    if (result === false) {
      setErrorMsg("Transaction was reverted on-chain. Please try again.");
      setStep("error");
      return;
    }

    setStep("submitting");
    doSubmitBuy(txHash);
  };

  const doSubmitBuy = (txHash: string) => {
    if (!selectedNetwork) return;
    submitBuy.mutate(
      { data: { chainId: chain.id, userAddress: walletAddress, mainnetTxHash: txHash, networkId: selectedNetwork.id } },
      {
        onSuccess: (res) => {
          setTestnetTxHash(res.testnetTxHash);
          setTestnetAmountSent(res.testnetAmountSent);
          setStep("success");
        },
        onError: (err: any) => {
          setErrorMsg(err?.data?.error || err.message || "Purchase failed. Contact support with your tx hash.");
          setStep("error");
        },
      }
    );
  };

  const copyToClipboard = (text: string, which: "addr" | "tx") => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  // Only use the chain's own configured explorer — no fallback to unknown 3rd-party sites
  const explorerUrl = chain?.explorerUrl
    ? `${chain.explorerUrl.replace(/\/$/, "")}/tx/${testnetTxHash}`
    : null;

  return (
    <>
      <Dialog open={!!chain} onOpenChange={(open) => { if (!open) { abortRef.current?.abort(); onClose(); } }}>
        <DialogContent
          className="sm:max-w-lg w-full flex flex-col p-0 gap-0"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "92vh", overflowY: "auto" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {chain.logoUrl
                  ? <img src={chain.logoUrl} alt={chain.symbol} className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-white">{chain.symbol.slice(0, 2)}</span>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                  <span className="font-mono font-bold uppercase tracking-tight text-sm text-white">Buy {chain.symbol}</span>
                  {chain.isTestnet && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }}>TESTNET</span>
                  )}
                </div>
                <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Send mainnet ETH → receive {chain.name} tokens
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {walletAddress && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                  style={{ color: "rgba(129,140,248,0.6)", background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.15)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(129,140,248,0.15)"; e.currentTarget.style.color = "#818cf8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(129,140,248,0.07)"; e.currentTarget.style.color = "rgba(129,140,248,0.6)"; }}
                  title="View transaction history"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => { abortRef.current?.abort(); onClose(); }} style={{ color: "rgba(255,255,255,0.35)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-5 flex flex-col gap-4">

            {infoLoading && (
              <div className="flex items-center justify-center py-10 gap-3">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#818cf8" }} />
                <span className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Loading...</span>
              </div>
            )}

            {infoError && (
              <div className="flex items-center gap-2 text-sm font-mono px-3 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle className="w-4 h-4 shrink-0" /> Buy not available for this chain.
              </div>
            )}

            {/* ─── MAIN BUY FORM ─── */}
            {buyInfo && step === "info" && (
              <>
                {/* Rate card */}
                <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)" }}>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Rate</p>
                    <p className="text-sm font-bold font-mono text-white">1 ETH <span style={{ color: "#818cf8" }}>→</span> {buyRate.toLocaleString()} {chain.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Min send</p>
                    <p className="text-sm font-bold font-mono text-white">{minAmount} ETH</p>
                  </div>
                </div>

                {/* Network selector */}
                {buyInfo.networks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Pay from network</p>
                    <div className="relative">
                      <button
                        onClick={() => setNetworkDropdown(!networkDropdown)}
                        className="w-full h-11 rounded-xl px-3 flex items-center gap-2.5 transition-all"
                        style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${netColor}44` }}
                      >
                        {netLogo && <img src={netLogo} alt="" className="w-5 h-5 rounded-full shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: netColor }} />
                        <span className="flex-1 text-left font-mono text-sm text-white">{selectedNetwork?.name || "Select network"}</span>
                        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
                      </button>
                      {networkDropdown && (
                        <div className="absolute top-12 left-0 right-0 rounded-xl z-50 overflow-hidden" style={{ background: "#13131f", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                          {buyInfo.networks.map((net) => {
                            const logo = NETWORK_LOGOS[net.id] || "";
                            const color = NETWORK_COLORS[net.id] || "#818cf8";
                            return (
                              <button key={net.id} onClick={() => { setSelectedNetwork(net); setNetworkDropdown(false); }}
                                className="w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors text-left"
                                style={{ background: selectedNetwork?.id === net.id ? "rgba(255,255,255,0.06)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                              >
                                {logo && <img src={logo} alt="" className="w-5 h-5 rounded-full shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                <div className="flex-1">
                                  <p className="font-mono text-sm text-white">{net.name}</p>
                                  <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>Chain ID: {net.chainId}</p>
                                </div>
                                {selectedNetwork?.id === net.id && <Check className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Receive address */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Send to this address ({selectedNetwork?.name || "selected network"})
                  </p>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <span className="flex-1 font-mono text-xs break-all text-white">{receiveAddress}</span>
                    <button onClick={() => copyToClipboard(receiveAddress, "addr")} style={{ color: copied === "addr" ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                      {copied === "addr" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Amount to send (ETH)</p>
                  <input
                    type="number" min={minAmount} step="0.0001" value={ethAmount}
                    onChange={(e) => setEthAmount(e.target.value)}
                    className="w-full h-11 rounded-xl px-3 font-mono text-sm text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${amountValid ? "rgba(129,140,248,0.3)" : "rgba(239,68,68,0.3)"}` }}
                    placeholder={`Min ${minAmount}`}
                  />
                  {ethAmountNum > 0 && (
                    <p className="text-xs font-mono mt-1.5" style={{ color: amountValid ? "#818cf8" : "#f87171" }}>
                      {amountValid ? `→ You will receive ≈ ${willReceive} ${chain.symbol}` : `Minimum is ${minAmount} ETH`}
                    </p>
                  )}
                </div>

                {/* Wallet connect / send button */}
                {!walletAddress ? (
                  <button
                    onClick={() => setWalletSelectorOpen(true)}
                    className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, #4f46e5 0%, ${netColor} 100%)`, color: "white", boxShadow: `0 0 20px ${netColor}44` }}
                  >
                    <Wallet className="w-4 h-4" /> Connect Wallet
                  </button>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-mono text-white">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                        <span className="text-xs font-mono" style={{ color: "#22c55e" }}>Connected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isFetchingBalance && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
                        {walletBalance !== null && !isFetchingBalance && (
                          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.45)" }}>
                            {walletBalance} {selectedNetwork?.symbol || "ETH"}
                          </span>
                        )}
                        <button
                          onClick={() => { setWalletAddress(""); setWalletProvider(null); setWalletBalance(null); }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded"
                          style={{ color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)" }}
                        >
                          Change
                        </button>
                      </div>
                    </div>
                    {(() => {
                      const GAS_RESERVE = 0.001;
                      const bal = walletBalance !== null ? parseFloat(walletBalance) : null;
                      const lowBal = bal !== null && ethAmountNum > 0 && bal < ethAmountNum + GAS_RESERVE;
                      const canSend = amountValid && !!selectedNetwork && !lowBal;
                      return (
                        <>
                          {lowBal && (
                            <div className="flex items-start gap-2 text-xs font-mono px-3 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              Insufficient balance. Need {(ethAmountNum + GAS_RESERVE).toFixed(4)} {selectedNetwork?.symbol || "ETH"} (incl. gas), you have {bal!.toFixed(4)}.
                            </div>
                          )}
                          <button onClick={sendEth} disabled={!canSend}
                            className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                            style={{
                              background: canSend ? `linear-gradient(135deg, #4f46e5 0%, ${netColor} 100%)` : "rgba(255,255,255,0.05)",
                              color: canSend ? "white" : "rgba(255,255,255,0.3)",
                              boxShadow: canSend ? `0 0 20px ${netColor}44` : "none",
                              cursor: canSend ? "pointer" : "not-allowed",
                            }}
                          >
                            <Zap className="w-4 h-4" /> Send {ethAmount} ETH via {selectedNetwork?.name || "Wallet"}
                          </button>
                        </>
                      );
                    })()}
                  </>
                )}

                {errorMsg && (
                  <div className="flex items-start gap-2 text-xs font-mono px-3 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errorMsg}
                  </div>
                )}
              </>
            )}

            {/* ─── WAITING FOR WALLET ─── */}
            {step === "sending" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${netColor}18`, border: `2px solid ${netColor}44` }}>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: netColor }} />
                </div>
                <div>
                  <p className="font-bold font-mono text-white">Waiting for wallet{dots}</p>
                  <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Confirm the transaction in your wallet app
                  </p>
                  <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                    Tokens will be sent automatically once confirmed on-chain
                  </p>
                </div>

                {/* Recovery panel — shown after 30s. WalletConnect mobile can silently drop responses. */}
                {sendingSeconds >= 30 && (
                  <div className="w-full flex flex-col gap-2 px-1">
                    <div className="rounded-xl px-3 py-2.5 text-xs font-mono text-left" style={{ background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.2)", color: "#fbbf24" }}>
                      Already approved in your wallet but the page is stuck? This sometimes happens with mobile wallets. Paste your transaction hash below — we'll verify it on-chain and send your tokens.
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={recoveryHash}
                        onChange={(e) => setRecoveryHash(e.target.value.trim())}
                        placeholder="0x... (your mainnet tx hash)"
                        className="flex-1 h-9 rounded-xl px-3 font-mono text-xs text-white outline-none min-w-0"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                      />
                      <button
                        onClick={handleRecoveryHashSubmit}
                        disabled={!recoveryHash.startsWith("0x") || recoveryHash.length < 60}
                        className="h-9 px-3 rounded-xl font-mono text-xs font-semibold shrink-0 transition-all flex items-center gap-1"
                        style={{
                          background: recoveryHash.startsWith("0x") && recoveryHash.length >= 60
                            ? `linear-gradient(135deg,#4f46e5,${netColor})`
                            : "rgba(255,255,255,0.06)",
                          color: recoveryHash.startsWith("0x") && recoveryHash.length >= 60
                            ? "#fff" : "rgba(255,255,255,0.3)",
                        }}
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> Submit
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { abortRef.current?.abort(); setStep("info"); setErrorMsg(""); }}
                  className="text-xs font-mono"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* ─── CONFIRMING ON-CHAIN ─── */}
            {step === "confirming" && (
              <div className="flex flex-col items-center gap-5 py-8 text-center">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full" style={{ background: `${netColor}10`, border: `2px solid ${netColor}30` }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Radio className="w-8 h-8" style={{ color: netColor }} />
                  </div>
                  <div className="absolute inset-0 rounded-full animate-ping" style={{ border: `2px solid ${netColor}`, opacity: 0.2, animationDuration: "1.5s" }} />
                </div>
                <div>
                  <p className="font-bold font-mono text-white text-base">Waiting for confirmation{dots}</p>
                  <p className="text-sm font-mono mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Transaction submitted to {selectedNetwork?.name}
                  </p>
                  <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Tokens will be sent automatically once confirmed
                  </p>
                </div>
                {mainnetTxHash && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg w-full justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="font-mono text-[11px] break-all" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {mainnetTxHash.slice(0, 14)}...{mainnetTxHash.slice(-10)}
                    </span>
                    <button onClick={() => copyToClipboard(mainnetTxHash, "tx")} style={{ color: copied === "tx" ? "#22c55e" : "rgba(255,255,255,0.3)" }}>
                      {copied === "tx" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─── SUBMITTING ─── */}
            {step === "submitting" && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(129,140,248,0.1)", border: "2px solid rgba(129,140,248,0.25)" }}>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
                </div>
                <div>
                  <p className="font-bold font-mono text-white">Sending {chain.symbol}{dots}</p>
                  <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Verifying & dispatching testnet tokens</p>
                </div>
              </div>
            )}

            {/* ─── SUCCESS ─── */}
            {step === "success" && (
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.25)" }}>
                    <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
                  </div>
                  <div>
                    <p className="font-bold font-mono text-white text-lg">Purchase Successful!</p>
                    <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{testnetAmountSent} {chain.symbol} sent to your wallet</p>
                  </div>
                </div>
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Testnet Tx Hash</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs break-all text-white">{testnetTxHash}</span>
                    <button onClick={() => copyToClipboard(testnetTxHash, "tx")} style={{ color: copied === "tx" ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                      {copied === "tx" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)" }}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-full h-11 rounded-xl font-bold font-mono uppercase tracking-widest text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
                >Close</button>
              </div>
            )}

            {/* ─── ERROR ─── */}
            {step === "error" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2 text-sm font-mono px-3 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
                </div>
                {mainnetTxHash && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Your mainnet tx hash</p>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-xs break-all" style={{ color: "rgba(255,255,255,0.5)" }}>{mainnetTxHash}</span>
                    </div>
                    <p className="text-[10px] font-mono mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                      Contact support with this hash if the issue persists.
                    </p>
                  </div>
                )}
                <button onClick={() => { setStep("info"); setErrorMsg(""); }}
                  className="w-full h-10 rounded-xl font-mono text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
                >← Try Again</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Selector Modal */}
      <WalletSelector
        open={walletSelectorOpen}
        onClose={() => setWalletSelectorOpen(false)}
        onConnected={handleWalletConnected}
        targetChainId={selectedNetwork?.chainId}
      />

      {/* History Modal */}
      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        walletAddress={walletAddress}
        defaultTab="buy"
      />
    </>
  );
}
