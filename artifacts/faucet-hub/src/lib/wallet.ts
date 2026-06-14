import type { EIP6963ProviderDetail } from "@/types/global";

export type { EIP6963ProviderDetail };

export const WALLET_SESSION_KEY = "chaindrop_wallet_v2";

export interface WalletSession {
  type: "injected" | "walletconnect";
  rdns?: string;
  address: string;
}

export interface KnownWallet {
  rdns: string;
  name: string;
  logo: string;
  color: string;
  installUrl: string;
  wcDeepLink?: (uri: string) => string;
  mobileDeepLink?: (url: string) => string;
}

export const KNOWN_WALLETS: KnownWallet[] = [
  {
    rdns: "io.metamask",
    name: "MetaMask",
    logo: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    color: "#E8831D",
    installUrl: "https://metamask.io/download",
    wcDeepLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    rdns: "io.rabby",
    name: "Rabby",
    logo: "https://raw.githubusercontent.com/RabbyHub/Rabby/master/src/ui/assets/rabby.svg",
    color: "#7084FF",
    installUrl: "https://rabby.io",
  },
  {
    rdns: "com.trustwallet.app",
    name: "Trust Wallet",
    logo: "https://trustwallet.com/assets/images/media/assets/TWT.png",
    color: "#3375BB",
    installUrl: "https://trustwallet.com/download",
    wcDeepLink: (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "com.coinbase.wallet",
    name: "Coinbase Wallet",
    logo: "https://images.ctfassets.net/q5ulk4bp65r7/3TBS4oVkD1ghowTqylkBsg/2dfd4ea3b623a7c0d8deb2ff445dee9e/coinbase-icon2.svg",
    color: "#0052FF",
    installUrl: "https://www.coinbase.com/wallet/downloads",
    wcDeepLink: (uri) => `https://go.cb-wallet.com/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://go.cb-wallet.com/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "com.okex.wallet",
    name: "OKX Wallet",
    logo: "https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png",
    color: "#000000",
    installUrl: "https://www.okx.com/web3",
    wcDeepLink: (uri) => `okx://wallet/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  {
    rdns: "com.binance.wallet",
    name: "Binance Web3 Wallet",
    logo: "https://bin.bnbstatic.com/image/admin_mgs_image_upload/20201110/87496d50-2408-43e1-ad4c-78b47b448a6a.png",
    color: "#F3BA2F",
    installUrl: "https://www.binance.com/en/web3wallet",
    wcDeepLink: (uri) => `bnc://app.binance.com/cedefi/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    rdns: "com.bitget.web3",
    name: "Bitget Wallet",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bitget_logo.svg/1200px-Bitget_logo.svg.png",
    color: "#00B897",
    installUrl: "https://web3.bitget.com/en/wallet-download",
    wcDeepLink: (uri) => `https://bkcode.vip/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "pro.tokenpocket",
    name: "TokenPocket",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/tokenpocket.pro/logo.png",
    color: "#2980FE",
    installUrl: "https://www.tokenpocket.pro/en/download/app",
    wcDeepLink: (uri) =>
      `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "wc", value: uri }))}`,
    mobileDeepLink: (url) =>
      `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "open", value: url }))}`,
  },
];

export interface ChainInfo {
  name: string;
  shortName: string;
  color: string;
  logo: string;
  nativeCurrency: string;
}

export const CHAIN_INFO: Record<number, ChainInfo> = {
  1:       { name: "Ethereum",  shortName: "ETH",  color: "#627EEA", logo: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",  nativeCurrency: "ETH" },
  10:      { name: "Optimism",  shortName: "OP",   color: "#FF0420", logo: "https://icons.llamao.fi/icons/chains/rsz_optimism.jpg",  nativeCurrency: "ETH" },
  56:      { name: "BSC",       shortName: "BSC",  color: "#F3BA2F", logo: "https://icons.llamao.fi/icons/chains/rsz_bsc.jpg",       nativeCurrency: "BNB" },
  137:     { name: "Polygon",   shortName: "POL",  color: "#8247E5", logo: "https://icons.llamao.fi/icons/chains/rsz_polygon.jpg",   nativeCurrency: "MATIC" },
  250:     { name: "Fantom",    shortName: "FTM",  color: "#13B5EC", logo: "https://icons.llamao.fi/icons/chains/rsz_fantom.jpg",    nativeCurrency: "FTM" },
  324:     { name: "zkSync",    shortName: "ETH",  color: "#4E529A", logo: "https://icons.llamao.fi/icons/chains/rsz_zksync%20era.jpg", nativeCurrency: "ETH" },
  8453:    { name: "Base",      shortName: "BASE", color: "#0052FF", logo: "https://icons.llamao.fi/icons/chains/rsz_base.jpg",      nativeCurrency: "ETH" },
  42161:   { name: "Arbitrum",  shortName: "ARB",  color: "#28A0F0", logo: "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg", nativeCurrency: "ETH" },
  43114:   { name: "Avalanche", shortName: "AVAX", color: "#E84142", logo: "https://icons.llamao.fi/icons/chains/rsz_avalanche.jpg", nativeCurrency: "AVAX" },
  59144:   { name: "Linea",     shortName: "ETH",  color: "#61DFFF", logo: "https://icons.llamao.fi/icons/chains/rsz_linea.jpg",    nativeCurrency: "ETH" },
  534352:  { name: "Scroll",    shortName: "ETH",  color: "#EEB878", logo: "https://icons.llamao.fi/icons/chains/rsz_scroll.jpg",   nativeCurrency: "ETH" },
};

export function getChainInfo(chainId: number | null): ChainInfo {
  if (!chainId) return { name: "Unknown", shortName: "?", color: "#555", logo: "", nativeCurrency: "ETH" };
  return CHAIN_INFO[chainId] ?? { name: `Chain ${chainId}`, shortName: String(chainId), color: "#555", logo: "", nativeCurrency: "ETH" };
}

export function formatBalance(bal: string | null, currency = "ETH"): string {
  if (!bal) return "";
  const n = parseFloat(bal);
  if (isNaN(n)) return "";
  return `${n.toFixed(4)} ${currency}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
