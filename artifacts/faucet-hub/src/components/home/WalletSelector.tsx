import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, X, ChevronRight, AlertCircle, ArrowLeft } from "lucide-react";

interface WalletSelectorProps {
  open: boolean;
  onClose: () => void;
  onConnected: (address: string, provider: "injected" | "walletconnect", wcProvider?: any) => void;
}

type Tab = "browser" | "mobile";

const MOBILE_WALLETS = [
  {
    id: "metamask",
    name: "MetaMask",
    logo: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    getLink: (url: string) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trustwallet.com/logo.png",
    getLink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    logo: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4",
    getLink: (url: string) => `https://go.cb-wallet.com/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bitget_logo.svg/1200px-Bitget_logo.svg.png",
    getLink: (url: string) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    logo: "https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png",
    getLink: (url: string) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    logo: "https://assets.coingecko.com/markets/images/1295/small/Rainbow.jpg",
    getLink: (url: string) => `https://rnbwapp.com/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    id: "bybit",
    name: "Bybit Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/bybit.com/logo.png",
    getLink: (url: string) => `https://www.bybit.com/en/web3/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/tokenpocket.pro/logo.png",
    getLink: (url: string) =>
      `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "open", value: url }))}`,
  },
];

export function WalletSelector({ open, onClose, onConnected }: WalletSelectorProps) {
  const [tab, setTab] = useState<Tab>("browser");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const dappUrl = window.location.href;

  useEffect(() => {
    if (!open) {
      setTab(isMobile ? "mobile" : "browser");
      setConnecting(false);
      setError("");
    } else {
      setTab(isMobile ? "mobile" : "browser");
    }
  }, [open, isMobile]);

  const connectBrowser = async () => {
    if (!window.ethereum) {
      setError("No wallet extension found. Install MetaMask for Chrome, or use the Mobile tab to open in your wallet app.");
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{
          background: "#13131f",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "20px",
          maxWidth: 380,
          width: "calc(100vw - 32px)",
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <span className="font-bold text-base text-white" style={{ letterSpacing: "-0.01em" }}>
            Connect Wallet
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex mx-5 mb-4 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["browser", "mobile"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: tab === t ? "rgba(255,255,255,0.1)" : "transparent",
                color: tab === t ? "#fff" : "rgba(255,255,255,0.4)",
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {t === "browser" ? "Browser" : "Mobile App"}
            </button>
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.18)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Browser Tab ── */}
        {tab === "browser" && (
          <div className="px-5 pb-5 space-y-2.5">
            <button
              onClick={connectBrowser}
              disabled={connecting}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] text-left"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              {/* MetaMask fox icon */}
              <div className="w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                style={{ background: "rgba(232,131,29,0.15)", border: "1px solid rgba(232,131,29,0.3)" }}>
                <img
                  src="https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg"
                  alt="MetaMask" className="w-7 h-7"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-white">MetaMask</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                  Browser extension
                </p>
              </div>
              {connecting
                ? <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                : <ChevronRight className="w-4 h-4 text-white/25" />
              }
            </button>

            <button
              onClick={connectBrowser}
              disabled={connecting}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] text-left"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <div className="w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                {/* Generic browser wallet icon */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="none"/>
                  <path d="M21 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
                  <path d="M2 10h20" stroke="#22c55e" strokeWidth="1.5"/>
                  <circle cx="7" cy="14" r="1.5" fill="#22c55e"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-white">Browser Wallet</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                  Brave, Coinbase, Rabby & more
                </p>
              </div>
              {connecting
                ? <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                : <ChevronRight className="w-4 h-4 text-white/25" />
              }
            </button>

            <p className="text-center text-[10px] pt-1" style={{ color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
              Make sure your wallet extension is unlocked
            </p>
          </div>
        )}

        {/* ── Mobile Tab ── */}
        {tab === "mobile" && (
          <div className="px-5 pb-5">
            <p className="text-[11px] mb-3 text-center" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
              Tap a wallet — it opens this page in its built-in browser
            </p>

            <div className="grid grid-cols-2 gap-2">
              {MOBILE_WALLETS.map((w) => (
                <a
                  key={w.id}
                  href={w.getLink(dappUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-3 rounded-2xl transition-all active:scale-[0.97]"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <img
                      src={w.logo}
                      alt={w.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-white leading-tight">{w.name}</span>
                </a>
              ))}
            </div>

            <div className="mt-4 px-3 py-3 rounded-xl" style={{ background: "rgba(56,139,253,0.07)", border: "1px solid rgba(56,139,253,0.15)" }}>
              <p className="text-[10px] text-center leading-relaxed" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                After the wallet opens this page, tap <span className="text-white/60">Connect Wallet</span> → <span className="text-white/60">Browser</span> tab to connect
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
