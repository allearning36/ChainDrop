import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, X, ChevronRight, AlertCircle, ExternalLink } from "lucide-react";
import { initWalletConnectProvider } from "@/lib/walletConnect";
import { KNOWN_WALLETS, type KnownWallet } from "@/lib/wallet";
import type { EIP1193Provider, EIP6963ProviderDetail } from "@/types/global";
import { useWallet } from "@/contexts/WalletContext";
import QRCode from "qrcode";

interface WalletSelectorProps {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  targetChainId?: number;
}

type View = "list" | "qr";

const isMobileDevice = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

function WalletIcon({ info, size = 40 }: { info: { name: string; icon: string; color?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const bg = info.color ? `${info.color}22` : "rgba(255,255,255,0.08)";
  const border = info.color ? `1px solid ${info.color}44` : "1px solid rgba(255,255,255,0.12)";
  return (
    <div
      className="rounded-xl shrink-0 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, background: bg, border }}
    >
      {!failed ? (
        <img
          src={info.icon}
          alt={info.name}
          className="object-contain"
          style={{ width: size * 0.65, height: size * 0.65 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-black text-white" style={{ fontSize: size * 0.38 }}>
          {info.name.slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function WalletRow({
  icon,
  name,
  badge,
  badgeColor = "#22c55e",
  subtitle,
  rightAction,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  name: string;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-40"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-white leading-tight">{name}</span>
          {badge && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
              style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{subtitle}</p>
        )}
      </div>
      {rightAction ?? <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />}
    </button>
  );
}

export function WalletSelector({ open, onClose, onConnected, targetChainId }: WalletSelectorProps) {
  const wallet = useWallet();
  const isMobile = isMobileDevice();

  const [view, setView] = useState<View>("list");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wcUri, setWcUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [wcProvider, setWcProvider] = useState<any>(null);

  // Discovered EIP-6963 wallets from context
  const detected = wallet.detectedWallets;

  // Also listen locally so the selector is reactive even before context propagates
  const [localDetected, setLocalDetected] = useState<EIP6963ProviderDetail[]>([]);
  useEffect(() => {
    const announced = new Map<string, EIP6963ProviderDetail>(
      wallet.detectedWallets.map(d => [d.info.rdns, d])
    );
    const handler = (event: CustomEvent<EIP6963ProviderDetail>) => {
      announced.set(event.detail.info.rdns, event.detail);
      setLocalDetected(Array.from(announced.values()));
    };
    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler as EventListener);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allDetected = localDetected.length > 0 ? localDetected : detected;

  useEffect(() => {
    if (!open) {
      setView("list");
      setError("");
      setConnecting(null);
      setWcUri("");
      setQrDataUrl("");
    }
  }, [open]);

  // Auto-close when wallet connects
  useEffect(() => {
    if (wallet.isConnected && open) {
      onConnected?.();
      onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.isConnected]);

  const handleClose = () => {
    if (wcProvider && !wallet.isConnected) {
      try { wcProvider.disconnect?.(); } catch {}
    }
    onClose();
  };

  // ── Injected wallet via EIP-6963 ──────────────────────────────────────────
  const connectDetected = async (detail: EIP6963ProviderDetail) => {
    setConnecting(detail.info.rdns);
    setError("");
    try {
      await wallet.connectInjected(detail.provider, detail.info.rdns);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (err?.code === 4001 || msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setError("Connection rejected. Please approve in your wallet.");
      } else if (msg.toLowerCase().includes("locked") || msg.toLowerCase().includes("unlock")) {
        setError("Wallet is locked. Please unlock it and try again.");
      } else {
        setError(msg || "Failed to connect wallet.");
      }
    } finally {
      setConnecting(null);
    }
  };

  // ── Fallback window.ethereum (no EIP-6963) ───────────────────────────────
  const connectWindowEthereum = async () => {
    if (!window.ethereum) {
      setError("No wallet extension found. Install a wallet or use WalletConnect.");
      return;
    }
    setConnecting("window.ethereum");
    setError("");
    try {
      await wallet.connectInjected(window.ethereum);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (err?.code === 4001 || msg.toLowerCase().includes("rejected")) {
        setError("Connection rejected. Please approve in your wallet.");
      } else {
        setError(msg || "Failed to connect.");
      }
    } finally {
      setConnecting(null);
    }
  };

  // ── WalletConnect init ────────────────────────────────────────────────────
  const initWC = async (): Promise<{ provider: any; uri: string } | null> => {
    setError("");
    try {
      const result = await initWalletConnectProvider(targetChainId);
      setWcProvider(result.provider);
      setWcUri(result.uri);

      result.provider.once("connect", async () => {
        const accounts = await result.provider.request({ method: "eth_accounts" }) as string[];
        if (accounts[0]) {
          await wallet.connectWalletConnect(result.provider as unknown as EIP1193Provider, accounts[0]);
        }
      });

      return result;
    } catch (err: any) {
      setError(err?.message || "Failed to initialize WalletConnect.");
      return null;
    }
  };

  // ── Show QR code ──────────────────────────────────────────────────────────
  const showQR = async () => {
    setView("qr");
    setQrDataUrl("");
    const result = await initWC();
    if (!result) { setView("list"); return; }
    const dataUrl = await QRCode.toDataURL(result.uri, {
      width: 260,
      margin: 2,
      color: { dark: "#ffffff", light: "#111118" },
    });
    setQrDataUrl(dataUrl);
  };

  // ── WalletConnect deep link for specific wallet ───────────────────────────
  const openWalletViaWC = async (kw: KnownWallet) => {
    setConnecting(kw.rdns);
    setError("");
    try {
      let uri = wcUri;
      if (!uri) {
        const result = await initWC();
        if (!result) { setConnecting(null); return; }
        uri = result.uri;
      }
      const link = kw.wcDeepLink!(uri);
      window.open(link, "_blank");
    } catch (err: any) {
      setError(err?.message || "Failed to open wallet.");
    } finally {
      setConnecting(null);
    }
  };

  // ── Build wallet list ─────────────────────────────────────────────────────
  const detectedRdns = new Set(allDetected.map(d => d.info.rdns));

  // Not-yet-detected known wallets that have a WC deep link or install link
  const notInstalled = KNOWN_WALLETS.filter(kw => !detectedRdns.has(kw.rdns));

  // On mobile: prefer deep links over QR
  const mobileWallets = KNOWN_WALLETS.filter(kw => kw.mobileDeepLink || kw.wcDeepLink);

  const loadingKey = connecting;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={{
          background: "#111118",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "20px",
          maxWidth: 400,
          width: "calc(100vw - 20px)",
          maxHeight: "88vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {view !== "list" ? (
            <button
              onClick={() => { setView("list"); setWcUri(""); setQrDataUrl(""); setError(""); }}
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              Back
            </button>
          ) : (
            <span className="font-bold text-base text-white">Connect Wallet</span>
          )}
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-4 mt-3 flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl shrink-0"
            style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.18)" }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── QR VIEW ── */}
        {view === "qr" && (
          <div className="flex flex-col items-center gap-4 px-5 py-5 overflow-y-auto">
            {qrDataUrl ? (
              <>
                <div
                  className="rounded-2xl overflow-hidden p-3"
                  style={{ background: "#111118", border: "2px solid rgba(56,139,253,0.3)" }}
                >
                  <img src={qrDataUrl} alt="WalletConnect QR" className="w-[240px] h-[240px] block" />
                </div>
                <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Open any wallet app → scan this QR code → approve
                </p>
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for wallet…</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Generating QR code…</span>
              </div>
            )}
          </div>
        )}

        {/* ── WALLET LIST VIEW ── */}
        {view === "list" && (
          <div className="overflow-y-auto px-4 py-4 space-y-2" style={{ maxHeight: "calc(88vh - 90px)" }}>

            {/* ── Detected wallets (EIP-6963) ── */}
            {allDetected.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest px-1 mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Detected wallets
                </p>
                {allDetected.map((detail) => (
                  <WalletRow
                    key={detail.info.rdns}
                    icon={<WalletIcon info={{ name: detail.info.name, icon: detail.info.icon }} />}
                    name={detail.info.name}
                    badge="Installed"
                    badgeColor="#22c55e"
                    onClick={() => connectDetected(detail)}
                    disabled={!!loadingKey}
                    rightAction={
                      loadingKey === detail.info.rdns ? (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#22c55e" }} />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}

            {/* ── No EIP-6963 detected: show generic browser extension option ── */}
            {allDetected.length === 0 && window.ethereum && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest px-1 mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Browser wallet
                </p>
                <WalletRow
                  icon={
                    <div
                      className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                      style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="6" width="20" height="14" rx="2" stroke="#22c55e" strokeWidth="1.6" />
                        <path d="M2 10h20" stroke="#22c55e" strokeWidth="1.6" />
                        <circle cx="7" cy="15" r="1.5" fill="#22c55e" />
                      </svg>
                    </div>
                  }
                  name="Browser Wallet"
                  subtitle="MetaMask, Brave, Coinbase & more"
                  onClick={connectWindowEthereum}
                  disabled={!!loadingKey}
                  rightAction={
                    loadingKey === "window.ethereum" ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#22c55e" }} />
                    ) : undefined
                  }
                />
              </div>
            )}

            {/* ── Mobile deep links ── */}
            {isMobile && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest px-1 mb-2 mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Open in wallet app
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {mobileWallets.map((kw) => {
                    const isDetected = detectedRdns.has(kw.rdns);
                    if (isDetected) return null;
                    const isLoading = loadingKey === kw.rdns;
                    const deepLink = kw.mobileDeepLink?.(window.location.href)
                      ?? (kw.wcDeepLink ? undefined : null);

                    return (
                      <button
                        key={kw.rdns}
                        disabled={!!loadingKey}
                        onClick={async () => {
                          if (deepLink) {
                            window.location.href = deepLink;
                          } else if (kw.wcDeepLink) {
                            await openWalletViaWC(kw);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.97] disabled:opacity-40"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <WalletIcon info={{ name: kw.name, icon: kw.logo, color: kw.color }} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white leading-tight truncate">{kw.name}</p>
                        </div>
                        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: kw.color }} />}
                      </button>
                    );
                  })}
                </div>
                {wcUri && (
                  <div className="flex items-center justify-center gap-1.5 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for wallet approval…</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Popular wallets not installed (desktop) ── */}
            {!isMobile && notInstalled.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest px-1 mb-2 mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Popular wallets
                </p>
                {notInstalled.slice(0, 4).map((kw) => (
                  <WalletRow
                    key={kw.rdns}
                    icon={<WalletIcon info={{ name: kw.name, icon: kw.logo, color: kw.color }} />}
                    name={kw.name}
                    onClick={() => window.open(kw.installUrl, "_blank")}
                    rightAction={
                      <span className="flex items-center gap-1 text-[11px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Install <ExternalLink className="w-3 h-3" />
                      </span>
                    }
                  />
                ))}
              </div>
            )}

            {/* ── WalletConnect QR ── */}
            <div className="space-y-1.5 pt-1">
              {!isMobile && (
                <p className="text-[10px] font-mono uppercase tracking-widest px-1 mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Scan QR code
                </p>
              )}
              <WalletRow
                icon={
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(56,139,253,0.12)", border: "1px solid rgba(56,139,253,0.25)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6" />
                      <rect x="14" y="3" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6" />
                      <rect x="3" y="14" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6" />
                      <path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z" fill="#388bfd" />
                    </svg>
                  </div>
                }
                name="WalletConnect"
                subtitle="Scan with any mobile wallet"
                onClick={showQR}
                disabled={!!loadingKey}
              />
            </div>

            <p className="text-center text-[10px] pt-1 pb-1" style={{ color: "rgba(255,255,255,0.18)" }}>
              Never share your seed phrase or private keys
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
