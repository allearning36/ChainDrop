import { useState, useRef, useEffect } from "react";
import { Wallet, Copy, Check, LogOut, ChevronDown, ArrowLeftRight } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { WalletSelector } from "@/components/home/WalletSelector";
import { getChainInfo, shortAddress, KNOWN_WALLETS } from "@/lib/wallet";
import type { EIP6963ProviderDetail } from "@/types/global";

function ChainBadge({ chainId }: { chainId: number | null }) {
  const info = getChainInfo(chainId);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
      style={{ background: `${info.color}18`, border: `1px solid ${info.color}44` }}
    >
      {info.logo && !imgFailed ? (
        <img
          src={info.logo}
          alt={info.name}
          className="w-3 h-3 rounded-full object-cover shrink-0"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: info.color }} />
      )}
      <span className="text-[10px] font-mono font-bold" style={{ color: info.color }}>{info.shortName}</span>
    </div>
  );
}

function WalletProviderIcon({ rdns, detectedWallets }: { rdns: string | null; detectedWallets: EIP6963ProviderDetail[] }) {
  const [failed, setFailed] = useState(false);
  const detail = rdns ? detectedWallets.find(d => d.info.rdns === rdns) : null;
  const known = rdns ? KNOWN_WALLETS.find(k => k.rdns === rdns) : null;
  const icon = detail?.info.icon ?? known?.logo;

  if (!icon || failed) {
    return (
      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
        <Wallet className="w-2.5 h-2.5 text-white" />
      </div>
    );
  }
  return (
    <img
      src={icon}
      alt={detail?.info.name ?? ""}
      className="w-4 h-4 rounded-full object-contain shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

export function WalletButton() {
  const wallet = useWallet();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [switchingChain, setSwitchingChain] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleCopy = () => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleSwitchChain = async (chainId: number) => {
    setSwitchingChain(chainId);
    try {
      await wallet.switchChain(chainId);
    } catch (err: any) {
      // Chain not added
      if (wallet.provider) {
        const info = getChainInfo(chainId);
        try {
          await wallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + chainId.toString(16),
              chainName: info.name,
              nativeCurrency: { name: info.nativeCurrency, symbol: info.nativeCurrency, decimals: 18 },
              rpcUrls: [],
            }],
          });
        } catch { /* user rejected */ }
      }
    } finally {
      setSwitchingChain(null);
      setDropdownOpen(false);
    }
  };

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!wallet.isConnected) {
    return (
      <>
        <button
          onClick={() => setSelectorOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-semibold text-xs shrink-0 transition-all"
          style={{
            background: "rgba(56,139,253,0.1)",
            border: "1px solid rgba(56,139,253,0.3)",
            color: "#388bfd",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(56,139,253,0.18)";
            e.currentTarget.style.borderColor = "rgba(56,139,253,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(56,139,253,0.1)";
            e.currentTarget.style.borderColor = "rgba(56,139,253,0.3)";
          }}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Connect</span>
        </button>
        <WalletSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
      </>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  const chainInfo = getChainInfo(wallet.chainId);

  const SWITCHABLE_CHAINS = [1, 8453, 42161, 10, 137, 56];

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all shrink-0"
          style={{
            background: "rgba(34,197,94,0.07)",
            border: "1px solid rgba(34,197,94,0.2)",
            color: "rgba(255,255,255,0.85)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(34,197,94,0.4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(34,197,94,0.2)"; }}
        >
          <WalletProviderIcon rdns={wallet.providerRdns} detectedWallets={wallet.detectedWallets} />
          <ChainBadge chainId={wallet.chainId} />
          <span className="hidden sm:inline text-white/80">{shortAddress(wallet.address!)}</span>
          {wallet.balance && (
            <span className="hidden md:inline text-white/40">· {parseFloat(wallet.balance).toFixed(3)} {chainInfo.nativeCurrency}</span>
          )}
          <ChevronDown className="w-3 h-3 text-white/30" />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-[calc(100%+6px)] rounded-2xl z-50 overflow-hidden min-w-[220px]"
            style={{
              background: "rgba(12,14,22,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 48px rgba(0,0,0,0.7)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Wallet info */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-1">
                <WalletProviderIcon rdns={wallet.providerRdns} detectedWallets={wallet.detectedWallets} />
                <span className="text-xs font-mono font-bold text-white">
                  {wallet.providerRdns
                    ? (wallet.detectedWallets.find(d => d.info.rdns === wallet.providerRdns)?.info.name
                      ?? KNOWN_WALLETS.find(k => k.rdns === wallet.providerRdns)?.name
                      ?? "Wallet")
                    : wallet.providerType === "walletconnect" ? "WalletConnect" : "Wallet"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {shortAddress(wallet.address!)}
                </span>
                <button
                  onClick={handleCopy}
                  className="w-5 h-5 rounded flex items-center justify-center transition-all"
                  style={{ background: "rgba(255,255,255,0.07)", color: copied ? "#22c55e" : "rgba(255,255,255,0.4)" }}
                  title="Copy address"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              {wallet.balance && (
                <p className="text-[11px] font-mono mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {parseFloat(wallet.balance).toFixed(4)} {chainInfo.nativeCurrency}
                </p>
              )}
            </div>

            {/* Current network */}
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                Network
              </p>
              <div className="flex items-center gap-2">
                {chainInfo.logo && (
                  <img src={chainInfo.logo} alt="" className="w-4 h-4 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <span className="text-xs font-mono font-semibold text-white">{chainInfo.name}</span>
              </div>
            </div>

            {/* Switch network */}
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                Switch network
              </p>
              <div className="grid grid-cols-3 gap-1">
                {SWITCHABLE_CHAINS.map((cId) => {
                  const info = getChainInfo(cId);
                  const isCurrent = wallet.chainId === cId;
                  const isSwitching = switchingChain === cId;
                  return (
                    <button
                      key={cId}
                      onClick={() => !isCurrent && handleSwitchChain(cId)}
                      disabled={isCurrent || isSwitching}
                      className="flex flex-col items-center gap-1 px-1 py-2 rounded-lg transition-all disabled:opacity-50"
                      style={{
                        background: isCurrent ? `${info.color}18` : "rgba(255,255,255,0.04)",
                        border: isCurrent ? `1px solid ${info.color}44` : "1px solid rgba(255,255,255,0.07)",
                      }}
                      title={info.name}
                    >
                      {info.logo ? (
                        <img src={info.logo} alt={info.name} className="w-5 h-5 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-5 h-5 rounded-full" style={{ background: info.color }} />
                      )}
                      <span className="text-[9px] font-mono font-bold leading-none" style={{ color: isCurrent ? info.color : "rgba(255,255,255,0.4)" }}>
                        {info.shortName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="p-2 space-y-0.5">
              <button
                onClick={() => { setDropdownOpen(false); setSelectorOpen(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors text-xs font-mono"
                style={{ color: "rgba(255,255,255,0.6)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Switch wallet
              </button>
              <button
                onClick={() => { wallet.disconnect(); setDropdownOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors text-xs font-mono"
                style={{ color: "#f87171" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      <WalletSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
