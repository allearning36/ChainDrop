import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Loader2, RefreshCcw, AlertTriangle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type BuyRefund = {
  id: number; orderType: "FAUCET_BUY"; userAddress: string; fromUserAddress: string | null;
  networkId: string | null; mainnetAmountPaid: string; mainnetTxHash: string;
  status: string; retryCount: number; lastError: string | null;
  refundStatus: string | null; refundTxHash: string | null; refundAt: string | null;
  createdAt: string; chainName: string | null; chainSymbol: string | null;
  networkName: string | null; networkSymbol: string | null;
};

type ExchangeRefund = {
  id: string; orderType: "CROSS_CHAIN_SWAP"; userAddress: string; fromUserAddress: string | null;
  depositAddress: string | null; fromAmount: string; toAmount: string;
  fromTxHash: string | null; status: string; retryCount: number;
  failReason: string | null; lastError: string | null;
  refundStatus: string | null; refundTxHash: string | null; refundAt: string | null;
  createdAt: string; fromChainName: string | null; fromSymbol: string | null;
  toChainName: string | null; toSymbol: string | null;
};

type RefundData = { buy: BuyRefund[]; exchange: ExchangeRefund[] };

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:        { label: "Pending",         color: "rgba(250,204,21,0.2)"  },
  failed:         { label: "Failed",          color: "rgba(239,68,68,0.2)"   },
  refund_required:{ label: "Refund Required", color: "rgba(239,100,0,0.2)"   },
  refunded:       { label: "Refunded",        color: "rgba(34,197,94,0.15)"  },
};
const REFUND_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "rgba(250,204,21,0.2)" },
  completed: { label: "Done",      color: "rgba(34,197,94,0.15)" },
  failed:    { label: "Failed",    color: "rgba(239,68,68,0.2)"  },
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: color, border: "1px solid rgba(255,255,255,0.08)", color: "#fff" }}>
      {text}
    </span>
  );
}

function RefundButton({ orderId, orderType, onSuccess }: { orderId: string | number; orderType: "FAUCET_BUY" | "CROSS_CHAIN_SWAP"; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refund() {
    setLoading(true); setErr(null);
    const path = orderType === "FAUCET_BUY"
      ? `/api/admin/orders/buy/${orderId}/refund`
      : `/api/admin/orders/exchange/${orderId}/refund`;
    try {
      const res = await adminFetch(path, { method: "POST" });
      if (res.ok) { setDone(true); onSuccess(); }
      else { const j = await res.json(); setErr((j as any).error ?? "Failed"); }
    } catch { setErr("Network error"); }
    setLoading(false);
  }

  if (done) return <span className="text-xs font-mono text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Refunded</span>;

  return (
    <div>
      <button
        onClick={() => void refund()}
        disabled={loading}
        className="text-xs font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
        style={{ background: "rgba(239,100,0,0.15)", border: "1px solid rgba(239,100,0,0.3)", color: "#f97316" }}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
        Refund
      </button>
      {err && <p className="text-[10px] font-mono text-red-400 mt-1">{err}</p>}
    </div>
  );
}

type TabId = "all" | "refund_required" | "refunded" | "failed";

export function RefundDashboard() {
  const [data, setData] = useState<RefundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("all");

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/orders/refunds");
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const allRows = data ? [
    ...data.buy.map(r => ({ ...r, _type: "buy" as const })),
    ...data.exchange.map(r => ({ ...r, _type: "exchange" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

  const filtered = allRows.filter(r => {
    if (tab === "all") return true;
    if (tab === "refund_required") return r.status === "refund_required";
    if (tab === "refunded") return r.status === "refunded";
    if (tab === "failed") return r.status === "failed" || r.refundStatus === "failed";
    return true;
  });

  const counts = {
    all: allRows.length,
    refund_required: allRows.filter(r => r.status === "refund_required").length,
    refunded: allRows.filter(r => r.status === "refunded").length,
    failed: allRows.filter(r => r.status === "failed" || r.refundStatus === "failed").length,
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: "all",             label: `All (${counts.all})` },
    { id: "refund_required", label: `⚠ Refund Required (${counts.refund_required})` },
    { id: "refunded",        label: `✓ Refunded (${counts.refunded})` },
    { id: "failed",          label: `✗ Failed (${counts.failed})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
            <RefreshCcw className="w-5 h-5 text-orange-400" /> Refund Dashboard
          </h2>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">
            Monitor and manually trigger refunds for failed orders.
          </p>
        </div>
        <button onClick={() => void load()} className="text-xs font-mono text-muted-foreground hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />} Refresh
        </button>
      </div>

      {counts.refund_required > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-mono" style={{ background: "rgba(239,100,0,0.1)", border: "1px solid rgba(239,100,0,0.3)", color: "#f97316" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {counts.refund_required} order{counts.refund_required > 1 ? "s" : ""} require refunds. The recovery worker will auto-process them, or you can trigger manually below.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 text-xs font-mono whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t.id ? "border-orange-400 text-orange-400" : "border-transparent text-muted-foreground hover:text-white")}
          >{t.label}</button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground font-mono text-sm">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-500/40" />
          No orders in this category.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(row => {
            const isBuy = row._type === "buy";
            const b = row as BuyRefund & { _type: "buy" };
            const e = row as ExchangeRefund & { _type: "exchange" };
            const statusInfo = STATUS_BADGE[row.status] ?? { label: row.status, color: "rgba(255,255,255,0.1)" };
            const refundInfo = row.refundStatus ? (REFUND_STATUS[row.refundStatus] ?? { label: row.refundStatus, color: "rgba(255,255,255,0.1)" }) : null;
            const canRefund = ["refund_required", "failed"].includes(row.status) && row.refundStatus !== "completed";

            return (
              <div key={`${row.orderType}-${row.id}`} className="p-4 rounded-xl space-y-2" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge text={isBuy ? "Buy" : "Swap"} color={isBuy ? "rgba(96,165,250,0.2)" : "rgba(168,85,247,0.2)"} />
                  <Badge text={statusInfo.label} color={statusInfo.color} />
                  {refundInfo && <Badge text={`Refund: ${refundInfo.label}`} color={refundInfo.color} />}
                  {row.retryCount > 0 && <Badge text={`${row.retryCount} retries`} color="rgba(255,255,255,0.08)" />}
                  <span className="ml-auto text-xs font-mono text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                  {isBuy ? (
                    <>
                      <div className="text-muted-foreground">Chain: <span className="text-white">{b.chainName}</span></div>
                      <div className="text-muted-foreground">Network: <span className="text-white">{b.networkName}</span></div>
                      <div className="text-muted-foreground">Amount: <span className="text-white">{b.mainnetAmountPaid} {b.networkSymbol}</span></div>
                      <div className="text-muted-foreground">Receiver: <span className="text-white truncate">{b.userAddress}</span></div>
                      {b.fromUserAddress && <div className="text-muted-foreground col-span-2">Sender: <span className="text-white break-all">{b.fromUserAddress}</span></div>}
                      {b.mainnetTxHash && <div className="text-muted-foreground col-span-2 flex items-center gap-1">Payment TX: <a href={`https://etherscan.io/tx/${b.mainnetTxHash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate max-w-[200px]">{b.mainnetTxHash.slice(0, 16)}…</a><ExternalLink className="w-3 h-3 text-blue-400 shrink-0" /></div>}
                    </>
                  ) : (
                    <>
                      <div className="text-muted-foreground">From: <span className="text-white">{e.fromAmount} {e.fromSymbol} ({e.fromChainName})</span></div>
                      <div className="text-muted-foreground">To: <span className="text-white">{e.toAmount} {e.toSymbol} ({e.toChainName})</span></div>
                      <div className="text-muted-foreground">Receiver: <span className="text-white truncate">{e.userAddress}</span></div>
                      {e.fromUserAddress && <div className="text-muted-foreground col-span-2">Sender: <span className="text-white break-all">{e.fromUserAddress}</span></div>}
                      {e.depositAddress && <div className="text-muted-foreground col-span-2">Deposit Wallet: <span className="text-white break-all">{e.depositAddress}</span></div>}
                      {e.fromTxHash && <div className="text-muted-foreground col-span-2 flex items-center gap-1">Payment TX: <span className="text-white truncate max-w-[200px]">{e.fromTxHash.slice(0, 16)}…</span></div>}
                    </>
                  )}
                  {(row as any).lastError && (
                    <div className="col-span-2 text-red-400/80 truncate">Error: {(row as any).lastError}</div>
                  )}
                  {row.refundTxHash && (
                    <div className="text-muted-foreground col-span-2">Refund TX: <span className="text-green-400 break-all">{row.refundTxHash}</span></div>
                  )}
                </div>

                {canRefund && (
                  <div className="pt-1">
                    <RefundButton
                      orderId={row.id}
                      orderType={row.orderType}
                      onSuccess={() => void load()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
