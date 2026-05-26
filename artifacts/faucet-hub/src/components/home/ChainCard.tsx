import { useState, useRef, useCallback } from "react";
import { ChainPublic, useGetChain, getGetChainQueryKey } from "@workspace/api-client-react";
import { Droplet, Wallet, Zap, Clock, Info, Copy, Check, ExternalLink, Plus } from "lucide-react";
import { formatCooldown, formatTokenAmount } from "@/lib/utils";

interface ChainCardProps {
  chain: ChainPublic;
  onClick: () => void;
  showNetworkBadge?: boolean;
}

export function ChainCard({ chain, onClick, showNetworkBadge }: ChainCardProps) {
  const [soonPopover, setSoonPopover] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [addingToWallet, setAddingToWallet] = useState(false);
  const [walletError, setWalletError] = useState("");
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  const openInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSoonPopover(false);
    if (!infoOpen && infoButtonRef.current) {
      const rect = infoButtonRef.current.getBoundingClientRect();
      const popW = 272;
      let left = rect.right - popW;
      if (left < 8) left = 8;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      const top = rect.bottom + 8;
      setPopoverPos({ top, left, width: popW });
    }
    setInfoOpen(p => !p);
  }, [infoOpen]);

  const { data: detail } = useGetChain(chain.id, {
    query: {
      enabled: !!chain.id,
      staleTime: 60000,
      queryKey: getGetChainQueryKey(chain.id),
    }
  });

  const displayChain = detail || chain;
  const isSoon = displayChain.availableStatus === "SOON";
  const isYes  = displayChain.availableStatus === "YES";
  const isEvm  = displayChain.chainType === "evm";

  const soonMsg: string =
    ("soonMessage" in displayChain && typeof (displayChain as any).soonMessage === "string" && (displayChain as any).soonMessage.trim())
      ? (displayChain as any).soonMessage
      : "This faucet will be live very soon. Stay tuned!";

  const rpcUrl: string | null = displayChain.rpcUrl ?? null;

  const evmChainId: number | null =
    typeof displayChain.chainId === "number" ? displayChain.chainId : null;

  function handleCopy(value: string, field: string) {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleAddToMetaMask() {
    if (!evmChainId) return;
    const eth = (window as any).ethereum;
    if (!eth) {
      setWalletError("MetaMask not detected.");
      setTimeout(() => setWalletError(""), 3000);
      return;
    }
    setAddingToWallet(true);
    setWalletError("");
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${evmChainId.toString(16)}`,
          chainName: displayChain.name,
          nativeCurrency: {
            name: displayChain.name,
            symbol: displayChain.symbol,
            decimals: 18,
          },
          rpcUrls: rpcUrl ? [rpcUrl] : [],
          blockExplorerUrls: displayChain.explorerUrl ? [displayChain.explorerUrl] : [],
        }],
      });
    } catch (err: any) {
      if (err?.code !== 4001) {
        setWalletError("Could not add network.");
        setTimeout(() => setWalletError(""), 3000);
      }
    } finally {
      setAddingToWallet(false);
    }
  }

  return (
    <div
      className="chain-card group relative flex flex-col overflow-visible transition-all duration-300"
      style={{
        background: "linear-gradient(145deg, rgba(14,17,22,0.95) 0%, rgba(10,13,18,0.98) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "16px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Hover glow overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[16px]"
        style={{
          background: isYes
            ? "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.07) 0%, transparent 70%)"
            : isSoon
            ? "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 70%)"
            : "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(239,68,68,0.05) 0%, transparent 70%)",
        }}
      />
      {/* Hover border glow */}
      <div
        className="absolute -inset-[1px] rounded-[16px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10"
        style={{
          background: isYes
            ? "linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(6,182,212,0.15) 100%)"
            : isSoon
            ? "linear-gradient(135deg, rgba(245,158,11,0.3) 0%, rgba(251,191,36,0.1) 100%)"
            : "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, transparent 100%)",
          filter: "blur(0.5px)",
        }}
      />

      <div className="relative p-5 flex flex-col gap-4 flex-1 overflow-visible">
        {/* Chain header */}
        <div className="flex items-center gap-3.5">
          {/* Logo with ring */}
          <div
            className="relative w-12 h-12 rounded-full shrink-0 overflow-hidden transition-all duration-300 group-hover:scale-105"
            style={{
              background: "rgba(255,255,255,0.05)",
              boxShadow: isYes
                ? "0 0 0 1px rgba(34,197,94,0.25), 0 0 12px rgba(34,197,94,0.15)"
                : "0 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            {displayChain.logoUrl ? (
              <img src={displayChain.logoUrl} alt={displayChain.name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-black text-base"
                style={{
                  background: "linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(6,182,212,0.1) 100%)",
                  color: "rgba(34,197,94,0.9)",
                }}
              >
                {displayChain.symbol.slice(0, 2)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight truncate text-white/90">{displayChain.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p
                className="text-xs font-mono font-semibold"
                style={{ color: "rgba(34,197,94,0.7)", letterSpacing: "0.06em" }}
              >
                {displayChain.symbol}
              </p>
              {showNetworkBadge && (
                <span
                  className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                  style={displayChain.isTestnet
                    ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                    : { background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }
                  }
                >
                  {displayChain.isTestnet ? "Testnet" : "Mainnet"}
                </span>
              )}
            </div>
          </div>

          {/* Status dot + Info button */}
          <div className="ml-auto shrink-0 flex items-center gap-2">
            {/* Info button — always visible */}
            <button
              ref={infoButtonRef}
              onClick={openInfo}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                background: infoOpen ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
                border: infoOpen ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(255,255,255,0.15)",
                color: infoOpen ? "#4ade80" : "rgba(255,255,255,0.6)",
                boxShadow: infoOpen ? "0 0 8px rgba(34,197,94,0.2)" : "none",
              }}
              title="Network details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {isYes ? (
              <span className="flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full opacity-60" style={{ background: "rgba(34,197,94,0.6)" }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#22c55e" }} />
              </span>
            ) : isSoon ? (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#f59e0b" }} />
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#ef4444" }} />
            )}
          </div>
        </div>

        {/* ── Info Popover (fixed, never clipped by card) ── */}
        {infoOpen && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setInfoOpen(false)} />
            <div
              className="fixed z-[100] rounded-2xl overflow-hidden shadow-2xl"
              style={{
                top: popoverPos.top,
                left: popoverPos.left,
                width: popoverPos.width,
                background: "rgba(10,13,20,0.97)",
                border: "1px solid rgba(34,197,94,0.2)",
                boxShadow: "0 0 32px rgba(34,197,94,0.08), 0 8px 32px rgba(0,0,0,0.6)",
                backdropFilter: "blur(16px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Popover header */}
              <div
                className="px-4 py-3 flex items-center gap-2.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
              >
                {displayChain.logoUrl ? (
                  <img src={displayChain.logoUrl} alt={displayChain.name} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                  >
                    {displayChain.symbol.slice(0, 2)}
                  </div>
                )}
                <span className="text-xs font-bold font-mono text-white/80">{displayChain.name}</span>
                <span
                  className="ml-auto text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                  style={displayChain.isTestnet
                    ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                    : { background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }
                  }
                >
                  {displayChain.isTestnet ? "Testnet" : "Mainnet"}
                </span>
              </div>

              {/* Popover rows */}
              <div className="px-4 py-3 space-y-2.5">
                {/* Chain ID */}
                {evmChainId != null && (
                  <InfoRow
                    label="Chain ID"
                    value={String(evmChainId)}
                    field="chainId"
                    copiedField={copiedField}
                    onCopy={handleCopy}
                  />
                )}

                {/* Symbol */}
                <InfoRow
                  label="Symbol"
                  value={displayChain.symbol}
                  field="symbol"
                  copiedField={copiedField}
                  onCopy={handleCopy}
                />

                {/* RPC */}
                {rpcUrl ? (
                  <InfoRow
                    label="RPC"
                    value={rpcUrl}
                    field="rpc"
                    copiedField={copiedField}
                    onCopy={handleCopy}
                    truncate
                  />
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>RPC</span>
                    <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>Loading…</span>
                  </div>
                )}

                {/* Explorer */}
                {displayChain.explorerUrl ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Explorer</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {displayChain.explorerUrl.replace(/^https?:\/\//, "")}
                      </span>
                      <button
                        onClick={() => handleCopy(displayChain.explorerUrl!, "explorer")}
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)", color: copiedField === "explorer" ? "#4ade80" : "rgba(255,255,255,0.3)" }}
                        title="Copy"
                      >
                        {copiedField === "explorer" ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                      <a
                        href={displayChain.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
                        onClick={(e) => e.stopPropagation()}
                        title="Open"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Add to MetaMask */}
              {isEvm && evmChainId != null && (
                <div
                  className="px-4 pb-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}
                >
                  {walletError && (
                    <p className="text-[10px] font-mono text-center mb-2" style={{ color: "#f87171" }}>{walletError}</p>
                  )}
                  <button
                    onClick={handleAddToMetaMask}
                    disabled={addingToWallet}
                    className="w-full h-7 rounded-lg flex items-center justify-center gap-1.5 font-semibold font-mono text-[10px] uppercase tracking-wider transition-all duration-200 active:scale-95"
                    style={{
                      background: addingToWallet
                        ? "rgba(245,158,11,0.06)"
                        : "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.06) 100%)",
                      border: "1px solid rgba(245,158,11,0.25)",
                      color: addingToWallet ? "rgba(245,158,11,0.4)" : "#fbbf24",
                      cursor: addingToWallet ? "not-allowed" : "pointer",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {addingToWallet ? "Adding…" : "Add to MetaMask"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Divider */}
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 50%, transparent)" }} />

        {/* Stats */}
        <div className="space-y-2.5 flex-1">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Wallet className="w-3.5 h-3.5" /> Reserve
            </span>
            <span className="font-mono text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              {"walletBalanceEth" in displayChain && displayChain.walletBalanceEth != null
                ? `${formatTokenAmount(displayChain.walletBalanceEth as string | number)} ${displayChain.symbol}`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Zap className="w-3.5 h-3.5" /> Drop
            </span>
            <span
              className="font-mono text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #4ade80, #22c55e)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {formatTokenAmount(displayChain.claimAmount)} {displayChain.symbol}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
              <Clock className="w-3.5 h-3.5" /> Cooldown
            </span>
            <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              {formatCooldown(displayChain.cooldownSeconds)}
            </span>
          </div>
        </div>

        {/* Action button */}
        <div className="pt-1">
          {isYes ? (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="chain-claim-btn w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase transition-all duration-200 active:scale-95 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #15803d 0%, #22c55e 60%, #4ade80 100%)",
                color: "#fff",
                boxShadow: "0 0 20px rgba(34,197,94,0.4), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                letterSpacing: "0.15em",
              }}
            >
              <span className="relative z-10">CLAIM</span>
              {/* Shimmer effect */}
              <span className="chain-claim-shimmer absolute inset-0 pointer-events-none" />
            </button>
          ) : isSoon ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setInfoOpen(false); setSoonPopover(p => !p); }}
                className="w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase transition-all duration-200 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #92400e 0%, #d97706 60%, #fbbf24 100%)",
                  color: "#fff",
                  boxShadow: "0 0 16px rgba(245,158,11,0.3), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                  letterSpacing: "0.15em",
                }}
              >
                SOON
              </button>
              {soonPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSoonPopover(false)} />
                  <div
                    className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl p-4 text-sm font-mono shadow-2xl"
                    style={{
                      background: "rgba(20,16,8,0.97)",
                      border: "1px solid rgba(245,158,11,0.35)",
                      boxShadow: "0 0 32px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.5)",
                      color: "#fbbf24",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">⏳</span>
                      <p className="leading-relaxed text-xs">{soonMsg}</p>
                    </div>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45"
                      style={{ background: "rgba(20,16,8,0.97)", border: "1px solid rgba(245,158,11,0.35)", borderTop: "none", borderLeft: "none" }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="w-full py-3 rounded-xl text-sm font-black font-mono tracking-widest uppercase text-center"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "rgba(239,68,68,0.6)",
                border: "1px solid rgba(239,68,68,0.15)",
                letterSpacing: "0.15em",
              }}
            >
              UNAVAILABLE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable info row ──────────────────────────────────────────────────────────
function InfoRow({
  label,
  value,
  field,
  copiedField,
  onCopy,
  truncate = false,
}: {
  label: string;
  value: string;
  field: string;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-mono uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`text-[11px] font-mono ${truncate ? "truncate" : ""}`}
          style={{ color: "rgba(255,255,255,0.7)" }}
          title={truncate ? value : undefined}
        >
          {value}
        </span>
        <button
          onClick={() => onCopy(value, field)}
          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: copiedField === field ? "#4ade80" : "rgba(255,255,255,0.3)",
          }}
          title="Copy"
        >
          {copiedField === field ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
        </button>
      </div>
    </div>
  );
}
