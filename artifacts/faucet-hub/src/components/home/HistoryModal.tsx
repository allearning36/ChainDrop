import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Loader2, ExternalLink, ArrowLeftRight, ShoppingCart, History as HistoryIcon } from "lucide-react";

interface SwapHistoryItem {
  id: string;
  fromSymbol: string | null;
  fromChainName: string | null;
  fromAmount: string;
  toSymbol: string | null;
  toChainName: string | null;
  toAmount: string | null;
  feeAmount: string | null;
  status: string;
  fromTxHash: string | null;
  toTxHash: string | null;
  fromExplorerUrl: string | null;
  toExplorerUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface BuyHistoryItem {
  id: number;
  chainId: number;
  chainName: string | null;
  chainSymbol: string | null;
  mainnetAmountPaid: string;
  testnetAmountSent: string | null;
  mainnetTxHash: string;
  testnetTxHash: string | null;
  status: string;
  explorerUrl: string | null;
  createdAt: string;
}

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
  defaultTab?: "swap" | "buy";
  onlyTab?: "swap" | "buy";
}

function statusStyle(status: string): { bg: string; color: string } {
  switch (status) {
    case "completed": return { bg: "rgba(34,197,94,0.12)", color: "#22c55e" };
    case "failed":    return { bg: "rgba(239,68,68,0.12)",  color: "#ef4444" };
    case "expired":   return { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
    case "confirming": return { bg: "rgba(99,102,241,0.12)", color: "#818cf8" };
    case "pending":
    case "processing": return { bg: "rgba(234,179,8,0.12)", color: "#eab308" };
    default:           return { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function TxLink({ hash, explorerUrl }: { hash: string | null; explorerUrl: string | null }) {
  if (!hash) return null;
  const href = explorerUrl ? `${explorerUrl.replace(/\/$/, "")}/tx/${hash}` : null;
  const short = hash.slice(0, 6) + "…" + hash.slice(-4);
  if (!href) return <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{short}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-mono text-[10px] transition-colors"
      style={{ color: "#818cf8" }}
      onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
      onMouseLeave={e => (e.currentTarget.style.color = "#818cf8")}
    >
      {short} <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

export function HistoryModal({ open, onClose, walletAddress, defaultTab = "swap", onlyTab }: HistoryModalProps) {
  const [tab, setTab] = useState<"swap" | "buy">(onlyTab ?? defaultTab);
  const [swaps, setSwaps]         = useState<SwapHistoryItem[]>([]);
  const [buys, setBuys]           = useState<BuyHistoryItem[]>([]);
  const [loadingSwaps, setLoadingSwaps] = useState(false);
  const [loadingBuys,  setLoadingBuys]  = useState(false);
  const [errSwaps, setErrSwaps]   = useState("");
  const [errBuys,  setErrBuys]    = useState("");

  useEffect(() => {
    if (open) setTab(onlyTab ?? defaultTab);
  }, [open, defaultTab, onlyTab]);

  useEffect(() => {
    if (!open || !walletAddress || onlyTab === "buy") return;
    setLoadingSwaps(true);
    setErrSwaps("");
    fetch(`/api/exchange/orders/history?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then((data: SwapHistoryItem[]) => { setSwaps(Array.isArray(data) ? data : []); setLoadingSwaps(false); })
      .catch(() => { setErrSwaps("Failed to load swap history"); setLoadingSwaps(false); });
  }, [open, walletAddress, onlyTab]);

  useEffect(() => {
    if (!open || !walletAddress || onlyTab === "swap") return;
    setLoadingBuys(true);
    setErrBuys("");
    fetch(`/api/faucet/buy/history/user?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then((data: BuyHistoryItem[]) => { setBuys(Array.isArray(data) ? data : []); setLoadingBuys(false); })
      .catch(() => { setErrBuys("Failed to load buy history"); setLoadingBuys(false); });
  }, [open, walletAddress, onlyTab]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg w-full flex flex-col p-0 gap-0"
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={onClose}
        style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-4 h-4" style={{ color: onlyTab === "buy" ? "#22c55e" : "#818cf8" }} />
            <span className="font-mono font-bold text-sm text-white">
              {onlyTab === "swap" ? "Swap History" : onlyTab === "buy" ? "Purchase History" : "Transaction History"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full transition-colors"
              style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs — only shown when both tabs are available */}
        {!onlyTab && (
          <div className="flex gap-1.5 px-5 pt-3 pb-2 flex-shrink-0">
            <button
              onClick={() => setTab("swap")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-all"
              style={tab === "swap"
                ? { background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid transparent" }}
            >
              <ArrowLeftRight className="w-3 h-3" />
              Swaps
              {swaps.length > 0 && (
                <span className="px-1 py-0.5 rounded-full text-[10px] leading-none" style={{ background: "rgba(129,140,248,0.2)", color: "#818cf8" }}>
                  {swaps.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("buy")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-all"
              style={tab === "buy"
                ? { background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid transparent" }}
            >
              <ShoppingCart className="w-3 h-3" />
              Purchases
              {buys.length > 0 && (
                <span className="px-1 py-0.5 rounded-full text-[10px] leading-none" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
                  {buys.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2 min-h-0">

          {/* ── Swap tab ── */}
          {tab === "swap" && (
            loadingSwaps ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#818cf8" }} />
                <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Loading…</span>
              </div>
            ) : errSwaps ? (
              <p className="text-center py-12 font-mono text-xs" style={{ color: "rgba(239,68,68,0.7)" }}>{errSwaps}</p>
            ) : swaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.15)" }}>
                  <ArrowLeftRight className="w-5 h-5" style={{ color: "rgba(129,140,248,0.45)" }} />
                </div>
                <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No swap history yet</p>
              </div>
            ) : (
              swaps.map(s => {
                const sc = statusStyle(s.status);
                return (
                  <div key={s.id} className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white min-w-0">
                        <span className="truncate">{s.fromAmount} {s.fromSymbol ?? "?"}</span>
                        <ArrowLeftRight className="w-3 h-3 shrink-0" style={{ color: "#818cf8" }} />
                        <span className="truncate">
                          {s.toAmount ? `${parseFloat(s.toAmount).toFixed(6)} ` : ""}{s.toSymbol ?? "?"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-semibold shrink-0" style={{ background: sc.bg, color: sc.color }}>
                        {s.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                      <span>{s.fromChainName ?? ""} → {s.toChainName ?? ""}</span>
                      <span>{fmtDate(s.createdAt)}</span>
                    </div>
                    {(s.fromTxHash || s.toTxHash) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        {s.fromTxHash && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Deposit:</span>
                            <TxLink hash={s.fromTxHash} explorerUrl={s.fromExplorerUrl} />
                          </div>
                        )}
                        {s.toTxHash && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Sent:</span>
                            <TxLink hash={s.toTxHash} explorerUrl={s.toExplorerUrl} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}

          {/* ── Buy tab ── */}
          {tab === "buy" && (
            loadingBuys ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#22c55e" }} />
                <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Loading…</span>
              </div>
            ) : errBuys ? (
              <p className="text-center py-12 font-mono text-xs" style={{ color: "rgba(239,68,68,0.7)" }}>{errBuys}</p>
            ) : buys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <ShoppingCart className="w-5 h-5" style={{ color: "rgba(34,197,94,0.45)" }} />
                </div>
                <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No purchase history yet</p>
              </div>
            ) : (
              buys.map(b => {
                const sc = statusStyle(b.status);
                return (
                  <div key={b.id} className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs font-semibold text-white min-w-0 truncate">
                        {b.mainnetAmountPaid} ETH
                        <span className="mx-1.5" style={{ color: "#22c55e" }}>→</span>
                        {b.testnetAmountSent ? `${parseFloat(b.testnetAmountSent).toFixed(6)} ` : ""}
                        {b.chainSymbol ?? b.chainName ?? "?"}
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-semibold shrink-0" style={{ background: sc.bg, color: sc.color }}>
                        {b.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                      <span>{b.chainName ?? `Chain #${b.chainId}`}</span>
                      <span>{fmtDate(b.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Paid:</span>
                        <TxLink hash={b.mainnetTxHash} explorerUrl="https://etherscan.io" />
                      </div>
                      {b.testnetTxHash && (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Sent:</span>
                          <TxLink hash={b.testnetTxHash} explorerUrl={b.explorerUrl} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
