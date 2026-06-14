import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { EIP1193Provider, EIP6963ProviderDetail } from "@/types/global";
import { WALLET_SESSION_KEY, type WalletSession } from "@/lib/wallet";
import { restoreWalletConnectSession, disconnectWalletConnect } from "@/lib/walletConnect";

interface WalletContextValue {
  address: string | null;
  chainId: number | null;
  balance: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  provider: EIP1193Provider | null;
  providerType: "injected" | "walletconnect" | null;
  providerRdns: string | null;
  detectedWallets: EIP6963ProviderDetail[];
  connectInjected: (provider: EIP1193Provider, rdns?: string) => Promise<void>;
  connectWalletConnect: (wcProvider: EIP1193Provider, address: string) => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

const WalletCtx = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

async function fetchChainId(prov: EIP1193Provider): Promise<number> {
  try {
    const hex = await prov.request({ method: "eth_chainId" }) as string;
    return parseInt(hex, 16);
  } catch {
    return 1;
  }
}

async function fetchBalance(prov: EIP1193Provider, addr: string): Promise<string | null> {
  try {
    const hex = await prov.request({ method: "eth_getBalance", params: [addr, "latest"] }) as string;
    return (Number(BigInt(hex)) / 1e18).toFixed(4);
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [providerType, setProviderType] = useState<"injected" | "walletconnect" | null>(null);
  const [providerRdns, setProviderRdns] = useState<string | null>(null);
  const [detectedWallets, setDetectedWallets] = useState<EIP6963ProviderDetail[]>([]);

  const listenersRef = useRef<{ accounts: (a: unknown) => void; chain: (c: unknown) => void; disc: () => void } | null>(null);
  const providerRef = useRef<EIP1193Provider | null>(null);
  providerRef.current = provider;

  const removeListeners = useCallback(() => {
    const prov = providerRef.current;
    const ls = listenersRef.current;
    if (!prov || !ls) return;
    try { prov.removeListener("accountsChanged", ls.accounts); } catch {}
    try { prov.removeListener("chainChanged", ls.chain); } catch {}
    try { prov.removeListener("disconnect", ls.disc); } catch {}
    listenersRef.current = null;
  }, []);

  const internalDisconnect = useCallback(() => {
    removeListeners();
    setAddress(null);
    setChainId(null);
    setBalance(null);
    setProvider(null);
    setProviderType(null);
    setProviderRdns(null);
    localStorage.removeItem(WALLET_SESSION_KEY);
  }, [removeListeners]);

  const setupProvider = useCallback(async (
    prov: EIP1193Provider,
    type: "injected" | "walletconnect",
    rdns?: string,
    knownAddress?: string,
  ) => {
    const addr = knownAddress ?? (() => { throw new Error("No address"); })();

    const [cId, bal] = await Promise.all([
      fetchChainId(prov),
      fetchBalance(prov, addr),
    ]);

    removeListeners();

    const onAccounts = (raw: unknown) => {
      const accounts = raw as string[];
      if (!accounts || accounts.length === 0) {
        internalDisconnect();
      } else {
        const newAddr = accounts[0];
        setAddress(newAddr);
        fetchBalance(prov, newAddr).then(b => setBalance(b));
        const session: WalletSession = { type, rdns, address: newAddr };
        localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
      }
    };
    const onChain = (raw: unknown) => {
      const hex = raw as string;
      setChainId(parseInt(hex, 16));
    };
    const onDisc = () => internalDisconnect();

    listenersRef.current = { accounts: onAccounts, chain: onChain, disc: onDisc };
    try { prov.on("accountsChanged", onAccounts); } catch {}
    try { prov.on("chainChanged", onChain); } catch {}
    try { prov.on("disconnect", onDisc); } catch {}

    setAddress(addr);
    setChainId(cId);
    setBalance(bal);
    setProvider(prov);
    setProviderType(type);
    setProviderRdns(rdns ?? null);

    const session: WalletSession = { type, rdns, address: addr };
    localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
  }, [removeListeners, internalDisconnect]);

  // ── EIP-6963 provider discovery ────────────────────────────────────────────
  useEffect(() => {
    const announced = new Map<string, EIP6963ProviderDetail>();
    const handler = (event: CustomEvent<EIP6963ProviderDetail>) => {
      const detail = event.detail;
      if (!announced.has(detail.info.rdns)) {
        announced.set(detail.info.rdns, detail);
        setDetectedWallets(Array.from(announced.values()));
      }
    };
    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler as EventListener);
  }, []);

  // ── Auto-reconnect from stored session ────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const stored = localStorage.getItem(WALLET_SESSION_KEY);
        if (!stored) return;
        const session = JSON.parse(stored) as WalletSession;

        if (session.type === "walletconnect") {
          const result = await restoreWalletConnectSession();
          if (result && result.address.toLowerCase() === session.address.toLowerCase()) {
            await setupProvider(result.provider as unknown as EIP1193Provider, "walletconnect", undefined, result.address);
          } else {
            localStorage.removeItem(WALLET_SESSION_KEY);
          }
          return;
        }

        // Injected
        let prov: EIP1193Provider | null = null;
        if (session.rdns) {
          prov = detectedWallets.find(w => w.info.rdns === session.rdns)?.provider ?? null;
        }
        if (!prov) prov = window.ethereum ?? null;
        if (!prov) { localStorage.removeItem(WALLET_SESSION_KEY); return; }

        const accounts = await prov.request({ method: "eth_accounts" }) as string[];
        const match = accounts.find(a => a.toLowerCase() === session.address.toLowerCase());
        if (match) {
          await setupProvider(prov, "injected", session.rdns, match);
        } else {
          localStorage.removeItem(WALLET_SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(WALLET_SESSION_KEY);
      }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedWallets]);

  // ── Balance polling every 15s ──────────────────────────────────────────────
  useEffect(() => {
    if (!address || !provider) return;
    const id = setInterval(() => {
      fetchBalance(provider, address).then(b => { if (b) setBalance(b); });
    }, 15_000);
    return () => clearInterval(id);
  }, [address, provider]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const connectInjected = useCallback(async (prov: EIP1193Provider, rdns?: string) => {
    setIsConnecting(true);
    try {
      const accounts = await prov.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.[0]) throw new Error("No accounts returned");
      await setupProvider(prov, "injected", rdns, accounts[0]);
    } finally {
      setIsConnecting(false);
    }
  }, [setupProvider]);

  const connectWalletConnect = useCallback(async (wcProvider: EIP1193Provider, addr: string) => {
    await setupProvider(wcProvider, "walletconnect", undefined, addr);
  }, [setupProvider]);

  const disconnect = useCallback(() => {
    internalDisconnect();
    disconnectWalletConnect().catch(() => {});
    // Also disconnect from old storage key for backwards compat
    localStorage.removeItem("chaindrop_exchange_wallet");
  }, [internalDisconnect]);

  const switchChain = useCallback(async (targetChainId: number) => {
    if (!provider) throw new Error("No wallet connected");
    const hex = "0x" + targetChainId.toString(16);
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  }, [provider]);

  return (
    <WalletCtx.Provider value={{
      address,
      chainId,
      balance,
      isConnected: !!address,
      isConnecting,
      provider,
      providerType,
      providerRdns,
      detectedWallets,
      connectInjected,
      connectWalletConnect,
      disconnect,
      switchChain,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}
