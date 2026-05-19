import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChainPublic, useGetBuyInfo, useSubmitBuy, getGetBuyInfoQueryKey } from "@workspace/api-client-react";
import {
  Loader2, X, Wallet, ArrowRight, CheckCircle2, Copy, Check,
  AlertCircle, ExternalLink, ArrowLeftRight, Zap,
} from "lucide-react";

interface BuyModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Step = "info" | "sending" | "submitting" | "success" | "error";

export function BuyModal({ chain, onClose }: BuyModalProps) {
  const [step, setStep] = useState<Step>("info");
  const [walletAddress, setWalletAddress] = useState("");
  const [ethAmount, setEthAmount] = useState("0.01");
  const [mainnetTxHash, setMainnetTxHash] = useState("");
  const [testnetTxHash, setTestnetTxHash] = useState("");
  const [testnetAmountSent, setTestnetAmountSent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<"addr" | "tx" | null>(null);
  const [connecting, setConnecting] = useState(false);

  const submitBuy = useSubmitBuy();

  const { data: buyInfo, isLoading: infoLoading, error: infoError } = useGetBuyInfo(
    chain?.id || 0,
    { query: { enabled: !!chain?.id && !!chain?.buyEnabled, queryKey: getGetBuyInfoQueryKey(chain?.id || 0) } }
  );

  useEffect(() => {
    if (!chain) {
      setStep("info");
      setWalletAddress("");
      setEthAmount("0.01");
      setMainnetTxHash("");
      setErrorMsg("");
    }
  }, [chain]);

  if (!chain || !chain.buyEnabled) return null;

  const isTestnet = chain.isTestnet;

  const receiveAddress = buyInfo?.receiveAddress || "";
  const buyRate = parseFloat(buyInfo?.buyRate || "1000");
  const minAmount = parseFloat(buyInfo?.minAmount || "0.001");
  const ethAmountNum = parseFloat(ethAmount) || 0;
  const willReceive = (ethAmountNum * buyRate).toFixed(8);
  const amountValid = ethAmountNum >= minAmount;

  const connectWallet = async () => {
    if (!window.ethereum) {
      setErrorMsg("MetaMask or a Web3 wallet is required. Please install MetaMask.");
      return;
    }
    setConnecting(true);
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts[0]) setWalletAddress(accounts[0]);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  };

  const sendEth = async () => {
    if (!window.ethereum || !walletAddress || !receiveAddress || !amountValid) return;
    setStep("sending");
    setErrorMsg("");
    try {
      const amountHex = "0x" + Math.floor(ethAmountNum * 1e18).toString(16);
      const txHash: string = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: walletAddress,
          to: receiveAddress,
          value: amountHex,
        }],
      });
      setMainnetTxHash(txHash);
      setStep("submitting");
      submitBuyRequest(txHash);
    } catch (err: any) {
      setErrorMsg(err?.message || "Transaction failed or was rejected");
      setStep("info");
    }
  };

  const submitBuyRequest = (txHash: string) => {
    submitBuy.mutate(
      { data: { chainId: chain.id, userAddress: walletAddress, mainnetTxHash: txHash } },
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

  const handleManualSubmit = () => {
    if (!mainnetTxHash || !walletAddress) return;
    setStep("submitting");
    submitBuyRequest(mainnetTxHash);
  };

  const copyToClipboard = (text: string, which: "addr" | "tx") => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const explorerUrl = `https://sepolia.etherscan.io/tx/${testnetTxHash}`;

  return (
    <Dialog open={!!chain} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg w-full flex flex-col p-0 gap-0" style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {chain.logoUrl
                ? <img src={chain.logoUrl} alt={chain.symbol} className="w-full h-full object-cover" />
                : <span className="text-xs font-bold text-white">{chain.symbol.slice(0, 2)}</span>
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                <span className="font-mono font-bold uppercase tracking-tight text-sm text-white">
                  Buy {chain.symbol}
                </span>
                {isTestnet && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }}>
                    TESTNET
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Send mainnet ETH → receive {chain.name} tokens
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.35)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 flex flex-col gap-4">

          {/* Loading info */}
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

          {/* STEP: INFO — main buy form */}
          {buyInfo && (step === "info" || step === "error") && (
            <>
              {/* Rate card */}
              <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)" }}>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Exchange Rate</p>
                  <p className="text-sm font-bold font-mono text-white">
                    1 ETH <span style={{ color: "#818cf8" }}>→</span> {buyRate.toLocaleString()} {chain.symbol}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Min Send</p>
                  <p className="text-sm font-bold font-mono text-white">{minAmount} ETH</p>
                </div>
              </div>

              {/* Receive address */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Send ETH to this address (Ethereum Mainnet)</p>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <span className="flex-1 font-mono text-xs break-all text-white">{receiveAddress}</span>
                  <button
                    onClick={() => copyToClipboard(receiveAddress, "addr")}
                    className="shrink-0 transition-opacity hover:opacity-70"
                    style={{ color: copied === "addr" ? "#22c55e" : "rgba(255,255,255,0.4)" }}
                  >
                    {copied === "addr" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* ETH amount input */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Amount to send (ETH)</p>
                <input
                  type="number"
                  min={minAmount}
                  step="0.001"
                  value={ethAmount}
                  onChange={(e) => setEthAmount(e.target.value)}
                  className="w-full h-11 rounded-xl px-3 font-mono text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${amountValid ? "rgba(129,140,248,0.3)" : "rgba(239,68,68,0.3)"}` }}
                  placeholder="0.01"
                />
                {ethAmountNum > 0 && (
                  <p className="text-xs font-mono mt-1.5" style={{ color: amountValid ? "#818cf8" : "#f87171" }}>
                    {amountValid
                      ? `→ You will receive ≈ ${willReceive} ${chain.symbol}`
                      : `Minimum is ${minAmount} ETH`}
                  </p>
                )}
              </div>

              {/* Wallet connect / send */}
              {!walletAddress ? (
                <button
                  onClick={connectWallet}
                  disabled={connecting}
                  className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: "linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)", color: "white", boxShadow: "0 0 20px rgba(129,140,248,0.25)", opacity: connecting ? 0.7 : 1 }}
                >
                  {connecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                    : <><Wallet className="w-4 h-4" /> Connect Wallet</>
                  }
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-mono text-white">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                    <span className="text-xs font-mono ml-auto" style={{ color: "#22c55e" }}>Connected</span>
                  </div>
                  <button
                    onClick={sendEth}
                    disabled={!amountValid}
                    className="w-full h-12 rounded-xl font-bold font-mono uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: amountValid ? "linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)" : "rgba(255,255,255,0.05)",
                      color: amountValid ? "white" : "rgba(255,255,255,0.3)",
                      boxShadow: amountValid ? "0 0 20px rgba(129,140,248,0.25)" : "none",
                      cursor: amountValid ? "pointer" : "not-allowed",
                    }}
                  >
                    <Zap className="w-4 h-4" /> Send {ethAmount} ETH via MetaMask
                  </button>
                </>
              )}

              {/* Manual fallback: already sent */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} className="pt-3">
                <p className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Already sent? Paste your mainnet tx hash:
                </p>
                <div className="flex gap-2">
                  <input
                    value={mainnetTxHash}
                    onChange={(e) => setMainnetTxHash(e.target.value.trim())}
                    placeholder="0x..."
                    className="flex-1 h-10 rounded-xl px-3 font-mono text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    onClick={handleManualSubmit}
                    disabled={!mainnetTxHash || !walletAddress}
                    className="px-4 h-10 rounded-xl font-bold font-mono text-xs flex items-center gap-1 transition-all"
                    style={{
                      background: mainnetTxHash && walletAddress ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.04)",
                      color: mainnetTxHash && walletAddress ? "#818cf8" : "rgba(255,255,255,0.2)",
                      border: "1px solid rgba(129,140,248,0.2)",
                    }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Claim
                  </button>
                </div>
                {!walletAddress && (
                  <p className="text-[11px] font-mono mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Connect wallet first to claim manually.
                  </p>
                )}
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 text-xs font-mono px-3 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errorMsg}
                </div>
              )}
            </>
          )}

          {/* STEP: SENDING — waiting for MetaMask */}
          {step === "sending" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(129,140,248,0.1)", border: "2px solid rgba(129,140,248,0.2)" }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
              </div>
              <div>
                <p className="font-bold font-mono text-white">Waiting for MetaMask...</p>
                <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Confirm the transaction in your wallet
                </p>
              </div>
            </div>
          )}

          {/* STEP: SUBMITTING — verifying + sending testnet */}
          {step === "submitting" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(129,140,248,0.1)", border: "2px solid rgba(129,140,248,0.2)" }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
              </div>
              <div>
                <p className="font-bold font-mono text-white">Verifying & Processing...</p>
                <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Checking your mainnet tx, then sending {chain.symbol}
                </p>
              </div>
              {mainnetTxHash && (
                <div className="text-xs font-mono break-all px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
                  {mainnetTxHash}
                </div>
              )}
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === "success" && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.25)" }}>
                  <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
                </div>
                <div>
                  <p className="font-bold font-mono text-white text-lg">Purchase Successful!</p>
                  <p className="text-sm font-mono mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {testnetAmountSent} {chain.symbol} sent to your wallet
                  </p>
                </div>
              </div>

              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <p className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>Testnet Tx Hash</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs break-all text-white">{testnetTxHash}</span>
                  <button onClick={() => copyToClipboard(testnetTxHash, "tx")} style={{ color: copied === "tx" ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                    {copied === "tx" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full h-11 rounded-xl font-bold font-mono uppercase tracking-widest text-sm"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
