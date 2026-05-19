import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Wallet, QrCode, Copy, Check, X, Smartphone, AlertCircle } from "lucide-react";
import { initWalletConnectProvider, disconnectWalletConnect, WALLET_DEEP_LINKS } from "@/lib/walletConnect";
import QRCode from "qrcode";

interface WalletSelectorProps {
  open: boolean;
  onClose: () => void;
  onConnected: (address: string, provider: "injected" | "walletconnect", wcProvider?: any) => void;
}

type View = "pick" | "wc-qr" | "wc-wallets" | "connecting";

export function WalletSelector({ open, onClose, onConnected }: WalletSelectorProps) {
  const [view, setView] = useState<View>("pick");
  const [wcUri, setWcUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setView("pick");
      setWcUri("");
      setQrDataUrl("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  const handleClose = () => {
    disconnectWalletConnect().catch(() => {});
    onClose();
  };

  // Connect via browser extension / injected wallet
  const connectInjected = async () => {
    if (!window.ethereum) {
      setError("No browser wallet detected. Please install MetaMask extension, or use WalletConnect to connect your mobile wallet.");
      return;
    }
    setLoading(true);
    setView("connecting");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts[0]) onConnected(accounts[0], "injected");
    } catch (err: any) {
      setError(err?.message || "Wallet connection cancelled.");
      setView("pick");
    } finally {
      setLoading(false);
    }
  };

  // Initialize WalletConnect and get URI/QR
  const startWalletConnect = async (showView: "wc-qr" | "wc-wallets") => {
    setLoading(true);
    setError("");
    try {
      const { provider, uri } = await initWalletConnectProvider();
      setWcUri(uri);
      setView(showView);

      // Generate QR code
      if (showView === "wc-qr") {
        const dataUrl = await QRCode.toDataURL(uri, {
          width: 280,
          margin: 2,
          color: { dark: "#ffffff", light: "#0d0d14" },
        });
        setQrDataUrl(dataUrl);
      }

      // Listen for wallet connection
      provider.once("connect", async () => {
        const accounts = await provider.request({ method: "eth_accounts" }) as string[];
        if (accounts[0]) onConnected(accounts[0], "walletconnect", provider);
      });

    } catch (err: any) {
      setError(err?.message || "Failed to start WalletConnect. Check your project ID.");
      setView("pick");
    } finally {
      setLoading(false);
    }
  };

  const copyUri = () => {
    navigator.clipboard.writeText(wcUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="sm:max-w-[400px] w-full p-0 gap-0"
        style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            {(view === "wc-qr" || view === "wc-wallets") && (
              <button onClick={() => { setView("pick"); setError(""); }} style={{ color: "rgba(255,255,255,0.4)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
            )}
            <span className="font-mono font-bold text-sm text-white uppercase tracking-widest">
              {view === "pick" ? "Connect Wallet" : view === "wc-qr" ? "Scan QR Code" : view === "wc-wallets" ? "Open Wallet" : "Connecting..."}
            </span>
          </div>
          <button onClick={handleClose} style={{ color: "rgba(255,255,255,0.35)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">

          {/* ─── PICK WALLET ─── */}
          {view === "pick" && (
            <div className="space-y-3">
              {error && (
                <div className="flex items-start gap-2 text-xs font-mono px-3 py-2.5 rounded-xl mb-2" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {/* Browser Wallet */}
              <button
                onClick={connectInjected}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left group"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.25)" }}>
                  <Wallet className="w-5 h-5" style={{ color: "#818cf8" }} />
                </div>
                <div>
                  <p className="font-mono font-bold text-sm text-white">Browser Wallet</p>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>MetaMask, Brave, Coinbase extension</p>
                </div>
              </button>

              {/* WalletConnect — QR (Desktop) */}
              {!isMobile && (
                <button
                  onClick={() => startWalletConnect("wc-qr")}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(56,139,253,0.15)", border: "1px solid rgba(56,139,253,0.25)" }}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} /> : <QrCode className="w-5 h-5" style={{ color: "#388bfd" }} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-sm text-white">WalletConnect</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(56,139,253,0.15)", color: "#388bfd", border: "1px solid rgba(56,139,253,0.25)" }}>QR</span>
                    </div>
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Scan with any mobile wallet</p>
                  </div>
                </button>
              )}

              {/* WalletConnect — Deep Links (Mobile) */}
              <button
                onClick={() => startWalletConnect("wc-wallets")}
                disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(56,139,253,0.15)", border: "1px solid rgba(56,139,253,0.25)" }}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} /> : <Smartphone className="w-5 h-5" style={{ color: "#388bfd" }} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-sm text-white">WalletConnect</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(56,139,253,0.15)", color: "#388bfd", border: "1px solid rgba(56,139,253,0.25)" }}>Mobile</span>
                  </div>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Trust, MetaMask, Bitget, TokenPocket...</p>
                </div>
              </button>

              {/* Wallet logos */}
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                {WALLET_DEEP_LINKS.map((w) => (
                  <div key={w.id} className="w-7 h-7 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <img src={w.logo} alt={w.name} className="w-full h-full object-contain p-0.5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                ))}
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>+300 more</span>
              </div>
            </div>
          )}

          {/* ─── QR CODE ─── */}
          {view === "wc-qr" && (
            <div className="flex flex-col items-center gap-4">
              {qrDataUrl ? (
                <>
                  <div className="rounded-2xl overflow-hidden p-3" style={{ background: "#0d0d14", border: "2px solid rgba(56,139,253,0.3)" }}>
                    <img src={qrDataUrl} alt="WalletConnect QR" className="w-[240px] h-[240px]" />
                  </div>
                  <p className="text-xs font-mono text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Open any wallet app and scan this QR code
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {WALLET_DEEP_LINKS.map((w) => (
                      <a key={w.id} href={w.getLink(wcUri)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                      >
                        <img src={w.logo} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        {w.name}
                      </a>
                    ))}
                  </div>
                  <button onClick={copyUri}
                    className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: copied ? "#22c55e" : "rgba(255,255,255,0.35)" }}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy URI"}
                  </button>
                  <div className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs font-mono">Waiting for wallet...</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-10">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} />
                  <span className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Generating QR code...</span>
                </div>
              )}
            </div>
          )}

          {/* ─── MOBILE DEEP LINKS ─── */}
          {view === "wc-wallets" && wcUri && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-center mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                Tap your wallet to open it and connect
              </p>
              {WALLET_DEEP_LINKS.map((w) => (
                <a key={w.id} href={w.getLink(wcUri)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <img src={w.logo} alt={w.name} className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <p className="font-mono font-bold text-sm text-white">{w.name}</p>
                </a>
              ))}
              <button onClick={copyUri}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg mt-2 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: copied ? "#22c55e" : "rgba(255,255,255,0.35)" }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy WalletConnect URI"}
              </button>
              <div className="flex items-center justify-center gap-1.5 mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs font-mono">Waiting for wallet to connect...</span>
              </div>
            </div>
          )}

          {/* ─── WAITING for wc-wallets to load URI ─── */}
          {view === "wc-wallets" && !wcUri && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#388bfd" }} />
              <span className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>Initializing WalletConnect...</span>
            </div>
          )}

          {/* ─── CONNECTING via injected ─── */}
          {view === "connecting" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
              <p className="font-mono text-sm text-white">Connecting wallet...</p>
              <p className="text-xs font-mono text-center" style={{ color: "rgba(255,255,255,0.35)" }}>Check your wallet for a connection request</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
