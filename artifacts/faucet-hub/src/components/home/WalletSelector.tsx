import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, X, ChevronRight, AlertCircle } from "lucide-react";
import { initWalletConnectProvider, disconnectWalletConnect } from "@/lib/walletConnect";
import QRCode from "qrcode";

interface WalletSelectorProps {
  open: boolean;
  onClose: () => void;
  onConnected: (address: string, provider: "injected" | "walletconnect", wcProvider?: any) => void;
}

type Tab = "browser" | "mobile";
type Step = "pick" | "qr" | "connecting";

const MOBILE_WALLETS = [
  {
    id: "metamask",
    name: "MetaMask",
    logo: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    color: "#E8831D",
    getWcLink: (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trustwallet.com/logo.png",
    color: "#3375BB",
    getWcLink: (uri: string) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "coinbase",
    name: "Coinbase",
    logo: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4",
    color: "#0052FF",
    getWcLink: (uri: string) => `https://go.cb-wallet.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    logo: "https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png",
    color: "#000",
    getWcLink: (uri: string) =>
      `okx://wallet/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bitget_logo.svg/1200px-Bitget_logo.svg.png",
    color: "#00B897",
    getWcLink: (uri: string) => `https://bkcode.vip/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    logo: "https://assets.coingecko.com/markets/images/1295/small/Rainbow.jpg",
    color: "#174299",
    getWcLink: (uri: string) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "bybit",
    name: "Bybit Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/bybit.com/logo.png",
    color: "#F7A600",
    getWcLink: (uri: string) => `bybitapp://open/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/tokenpocket.pro/logo.png",
    color: "#2980FE",
    getWcLink: (uri: string) =>
      `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "wc", value: uri }))}`,
  },
];

export function WalletSelector({ open, onClose, onConnected }: WalletSelectorProps) {
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  const [tab, setTab] = useState<Tab>(isMobile ? "mobile" : "browser");
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  // WalletConnect state
  const [wcUri, setWcUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [wcProvider, setWcProvider] = useState<any>(null);

  useEffect(() => {
    if (!open) {
      setTab(isMobile ? "mobile" : "browser");
      setStep("pick");
      setError("");
      setConnecting(false);
      setWcUri("");
      setQrDataUrl("");
    }
  }, [open, isMobile]);

  const handleClose = () => {
    disconnectWalletConnect().catch(() => {});
    onClose();
  };

  // ── Browser extension connect ──
  const connectBrowser = async () => {
    if (!window.ethereum) {
      setError("No browser wallet found. Install MetaMask extension, or switch to the Mobile tab.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts[0]) onConnected(accounts[0], "injected");
    } catch (err: any) {
      setError(err?.message || "Connection cancelled.");
    } finally {
      setConnecting(false);
    }
  };

  // ── Init WalletConnect and get URI ──
  const initWC = async (): Promise<{ provider: any; uri: string } | null> => {
    setError("");
    try {
      const result = await initWalletConnectProvider();
      setWcProvider(result.provider);
      setWcUri(result.uri);

      result.provider.once("connect", async () => {
        const accounts = await result.provider.request({ method: "eth_accounts" }) as string[];
        if (accounts[0]) onConnected(accounts[0], "walletconnect", result.provider);
      });

      return result;
    } catch (err: any) {
      setError(err?.message || "Failed to initialize WalletConnect.");
      return null;
    }
  };

  // ── Show QR (desktop) ──
  const showQR = async () => {
    setStep("qr");
    setQrDataUrl("");
    const result = await initWC();
    if (!result) { setStep("pick"); return; }
    const dataUrl = await QRCode.toDataURL(result.uri, {
      width: 260,
      margin: 2,
      color: { dark: "#ffffff", light: "#111118" },
    });
    setQrDataUrl(dataUrl);
  };

  // ── Open specific mobile wallet via WalletConnect deep link ──
  const openMobileWallet = async (wallet: typeof MOBILE_WALLETS[0]) => {
    setConnecting(true);
    setError("");
    try {
      // Reuse existing URI if we already have one
      let uri = wcUri;
      if (!uri) {
        const result = await initWC();
        if (!result) { setConnecting(false); return; }
        uri = result.uri;
      }
      const link = wallet.getWcLink(uri);
      window.open(link, "_blank");
    } catch (err: any) {
      setError(err?.message || "Failed to open wallet.");
    } finally {
      setConnecting(false);
    }
  };

  const card = (children: React.ReactNode, onClick?: () => void, disabled?: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{
          background: "#111118",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "20px",
          maxWidth: 400,
          width: "calc(100vw - 24px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          {step !== "pick" ? (
            <button onClick={() => { setStep("pick"); setWcUri(""); setQrDataUrl(""); setError(""); }}
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "rgba(255,255,255,0.5)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Back
            </button>
          ) : (
            <span className="font-bold text-base text-white">Connect Wallet</span>
          )}
          <button onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* Tabs */}
        {step === "pick" && (
          <div className="flex mx-5 mb-4 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
            {(["browser", "mobile"] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-widest"
                style={{
                  background: tab === t ? "rgba(255,255,255,0.1)" : "transparent",
                  color: tab === t ? "#fff" : "rgba(255,255,255,0.35)",
                }}>
                {t === "browser" ? "Browser" : "Mobile"}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.18)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="px-5 pb-5">

          {/* ── BROWSER TAB ── */}
          {step === "pick" && tab === "browser" && (
            <div className="space-y-2.5">
              {card(
                <>
                  <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center overflow-hidden"
                    style={{ background: "rgba(232,131,29,0.15)", border: "1px solid rgba(232,131,29,0.3)" }}>
                    <img src="https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg"
                      alt="MetaMask" className="w-7 h-7"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">MetaMask</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Browser extension</p>
                  </div>
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/20" />}
                </>,
                connectBrowser, connecting
              )}
              {card(
                <>
                  <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="6" width="20" height="14" rx="2" stroke="#22c55e" strokeWidth="1.6" fill="none"/>
                      <path d="M2 10h20" stroke="#22c55e" strokeWidth="1.6"/>
                      <circle cx="7" cy="15" r="1.5" fill="#22c55e"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">Browser Wallet</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Brave, Coinbase, Rabby & more</p>
                  </div>
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/20" />}
                </>,
                connectBrowser, connecting
              )}
              {!isMobile && card(
                <>
                  <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(56,139,253,0.12)", border: "1px solid rgba(56,139,253,0.25)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6"/>
                      <rect x="14" y="3" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6"/>
                      <rect x="3" y="14" width="7" height="7" rx="1" stroke="#388bfd" strokeWidth="1.6"/>
                      <path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z" fill="#388bfd"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">WalletConnect QR</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Scan with any mobile wallet</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20" />
                </>,
                showQR
              )}
              <p className="text-center text-[10px] pt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                Make sure your wallet extension is unlocked
              </p>
            </div>
          )}

          {/* ── MOBILE TAB ── */}
          {step === "pick" && tab === "mobile" && (
            <div className="space-y-3">
              <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                Tap your wallet — it will open a connect popup
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_WALLETS.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => openMobileWallet(w)}
                    disabled={connecting}
                    className="flex items-center gap-2.5 px-3 py-3 rounded-2xl text-left transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <div className="w-9 h-9 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <img src={w.logo} alt={w.name} className="w-6 h-6 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                    <span className="text-xs font-semibold text-white leading-tight">{w.name}</span>
                  </button>
                ))}
              </div>

              {connecting && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#388bfd" }} />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Opening wallet...</span>
                </div>
              )}

              {wcUri && !connecting && (
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for wallet approval...</span>
                </div>
              )}

              <p className="text-center text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                Approve the connection request in your wallet app
              </p>
            </div>
          )}

          {/* ── QR CODE ── */}
          {step === "qr" && (
            <div className="flex flex-col items-center gap-4">
              {qrDataUrl ? (
                <>
                  <div className="rounded-2xl overflow-hidden p-3"
                    style={{ background: "#111118", border: "2px solid rgba(56,139,253,0.3)" }}>
                    <img src={qrDataUrl} alt="WalletConnect QR" className="w-[240px] h-[240px] block" />
                  </div>
                  <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Open any wallet app → scan this QR code → approve
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for wallet...</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} />
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Generating QR code...</span>
                </div>
              )}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
