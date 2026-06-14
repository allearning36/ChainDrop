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
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPScjRTg4MzFEJy8+PHBvbHlnb24gcG9pbnRzPSc1MCwxOCA3MiwzMiA3Miw1NSA1MCw2OCAyOCw1NSAyOCwzMicgZmlsbD0nI0ZGRicgb3BhY2l0eT0nMC4xNScvPjxwb2x5Z29uIHBvaW50cz0nNTAsMjIgNjgsMzQgNjgsNTMgNTAsNjUgMzIsNTMgMzIsMzQnIGZpbGw9J25vbmUnIHN0cm9rZT0nJTIzRkZGJyBzdHJva2Utd2lkdGg9JzInIG9wYWNpdHk9JzAuOCcvPjxwb2x5Z29uIHBvaW50cz0nNDAsMzggNTAsMjggNjAsMzggNTYsNTQgNDQsNTQnIGZpbGw9JyUyM0ZGRicvPjxjaXJjbGUgY3g9JzQ0JyBjeT0nNDQnIHI9JzMuNScgZmlsbD0nJTIzRTg4MzFEJy8+PGNpcmNsZSBjeD0nNTYnIGN5PSc0NCcgcj0nMy41JyBmaWxsPSclMjNFODgzMUQnLz48cG9seWdvbiBwb2ludHM9JzQwLDU4IDUwLDY2IDYwLDU4IDU4LDcyIDQyLDcyJyBmaWxsPSclMjNGRkYnIG9wYWNpdHk9JzAuOScvPjwvc3ZnPg==",
    color: "#E8831D",
    installUrl: "https://metamask.io/download",
    wcDeepLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    rdns: "io.rabby",
    name: "Rabby",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjM3MDg0RkYnLz48ZWxsaXBzZSBjeD0nNTAnIGN5PSc1OCcgcng9JzIyJyByeT0nMTgnIGZpbGw9J3doaXRlJy8+PGVsbGlwc2UgY3g9JzM4JyBjeT0nMzUnIHJ4PSc4JyByeT0nMTQnIGZpbGw9J3doaXRlJy8+PGVsbGlwc2UgY3g9JzYyJyBjeT0nMzUnIHJ4PSc4JyByeT0nMTQnIGZpbGw9J3doaXRlJy8+PGNpcmNsZSBjeD0nNDQnIGN5PSc1Nicgcj0nMycgZmlsbD0nJTIzNzA4NEZGJy8+PGNpcmNsZSBjeD0nNTYnIGN5PSc1Nicgcj0nMycgZmlsbD0nJTIzNzA4NEZGJy8+PHBhdGggZD0nTTQ0IDYzIFE1MCA2OCA1NiA2Mycgc3Ryb2tlPSclMjM3MDg0RkYnIHN0cm9rZS13aWR0aD0nMicgZmlsbD0nbm9uZScvPjwvc3ZnPg==",
    color: "#7084FF",
    installUrl: "https://rabby.io",
  },
  {
    rdns: "com.trustwallet.app",
    name: "Trust Wallet",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPScjMzM3NUJCJy8+PHBhdGggZD0nTTUwIDIwIEw3MiAzMCBMNzIgNTIgUTcyIDY4IDUwIDgwIFEyOCA2OCAyOCA1MiBMMjggMzAgWicgZmlsbD0nd2hpdGUnIG9wYWNpdHk9JzAuOTUnLz48cGF0aCBkPSdNNTAgMzAgTDY1IDM3IEw2NSA1MyBRNjUgNjQgNTAgNzMgUTM1IDY0IDM1IDUzIEwzNSAzNyBaJyBmaWxsPSclMjMzMzc1QkInLz48L3N2Zz4=",
    color: "#3375BB",
    installUrl: "https://trustwallet.com/download",
    wcDeepLink: (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "com.coinbase.wallet",
    name: "Coinbase Wallet",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjMwMDUyRkYnLz48Y2lyY2xlIGN4PSc1MCcgY3k9JzUwJyByPScyOCcgZmlsbD0nd2hpdGUnLz48Y2lyY2xlIGN4PSc1MCcgY3k9JzUwJyByPScxOCcgZmlsbD0nJTIzMDA1MkZGJy8+PC9zdmc+",
    color: "#0052FF",
    installUrl: "https://www.coinbase.com/wallet/downloads",
    wcDeepLink: (uri) => `https://go.cb-wallet.com/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://go.cb-wallet.com/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "com.okex.wallet",
    name: "OKX Wallet",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjMxQzFDMUUnLz48cmVjdCB4PScyOCcgeT0nMjgnIHdpZHRoPScxOCcgaGVpZ2h0PScxOCcgcng9JzMnIGZpbGw9J3doaXRlJy8+PHJlY3QgeD0nNDEnIHk9JzQxJyB3aWR0aD0nMTgnIGhlaWdodD0nMTgnIHJ4PSczJyBmaWxsPSd3aGl0ZScvPjxyZWN0IHg9JzU0JyB5PScyOCcgd2lkdGg9JzE4JyBoZWlnaHQ9JzE4JyByeD0nMycgZmlsbD0nd2hpdGUnLz48cmVjdCB4PScyOCcgeT0nNTQnIHdpZHRoPScxOCcgaGVpZ2h0PScxOCcgcng9JzMnIGZpbGw9J3doaXRlJy8+PHJlY3QgeD0nNTQnIHk9JzU0JyB3aWR0aD0nMTgnIGhlaWdodD0nMTgnIHJ4PSczJyBmaWxsPSd3aGl0ZScvPjwvc3ZnPg==",
    color: "#131619",
    installUrl: "https://www.okx.com/web3",
    wcDeepLink: (uri) => `okx://wallet/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  {
    rdns: "com.binance.wallet",
    name: "Binance Web3 Wallet",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjNGM0JBMkYnLz48cG9seWdvbiBwb2ludHM9JzUwLDIwIDU4LDMwIDUwLDM4IDQyLDMwJyBmaWxsPSd3aGl0ZScvPjxwb2x5Z29uIHBvaW50cz0nMjAsNTAgMzAsNDIgMzgsNTAgMzAsNTgnIGZpbGw9J3doaXRlJy8+PHBvbHlnb24gcG9pbnRzPSc1MCw2MiA1OCw3MCA1MCw4MCA0Miw3MCcgZmlsbD0nd2hpdGUnLz48cG9seWdvbiBwb2ludHM9JzgwLDUwIDcwLDQyIDYyLDUwIDcwLDU4JyBmaWxsPSd3aGl0ZScvPjxwb2x5Z29uIHBvaW50cz0nNTAsMzggNjIsNTAgNTAsNjIgMzgsNTAnIGZpbGw9J3doaXRlJy8+PC9zdmc+",
    color: "#F3BA2F",
    installUrl: "https://www.binance.com/en/web3wallet",
    wcDeepLink: (uri) => `bnc://app.binance.com/cedefi/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    rdns: "com.bitget.web3",
    name: "Bitget Wallet",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjMwMEI4OTcnLz48dGV4dCB4PSc1MCcgeT0nNjUnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdBcmlhbCxzYW5zLXNlcmlmJyBmb250LXdlaWdodD0nOTAwJyBmb250LXNpemU9JzM4JyBmaWxsPSd3aGl0ZSc+Qkc8L3RleHQ+PC9zdmc+",
    color: "#00B897",
    installUrl: "https://web3.bitget.com/en/wallet-download",
    wcDeepLink: (uri) => `https://bkcode.vip/wc?uri=${encodeURIComponent(uri)}`,
    mobileDeepLink: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    rdns: "pro.tokenpocket",
    name: "TokenPocket",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcgcng9JzIwJyBmaWxsPSclMjMyOTgwRkUnLz48cmVjdCB4PSczMCcgeT0nMjUnIHdpZHRoPSc0MCcgaGVpZ2h0PSc1MCcgcng9JzYnIGZpbGw9J3doaXRlJyBvcGFjaXR5PScwLjknLz48cmVjdCB4PSczNicgeT0nMzMnIHdpZHRoPScyOCcgaGVpZ2h0PSc0JyByeD0nMicgZmlsbD0nJTIzMjk4MEZFJy8+PHJlY3QgeD0nMzYnIHk9JzQyJyB3aWR0aD0nMjAnIGhlaWdodD0nNCcgcng9JzInIGZpbGw9JyUyMzI5ODBGRScvPjxyZWN0IHg9JzM2JyB5PSc1MScgd2lkdGg9JzI0JyBoZWlnaHQ9JzQnIHJ4PScyJyBmaWxsPSclMjMyOTgwRkUnLz48Y2lyY2xlIGN4PSc2NScgY3k9JzY1JyByPScxNCcgZmlsbD0nJTIzMWE2ZmQ0Jy8+PHRleHQgeD0nNjUnIHk9JzcwJyB0ZXh0LWFuY2hvcj0nbWlkZGxlJyBmb250LWZhbWlseT0nQXJpYWwsc2Fucy1zZXJpZicgZm9udC13ZWlnaHQ9JzkwMCcgZm9udC1zaXplPScxNCcgZmlsbD0nd2hpdGUnPlRQPC90ZXh0Pjwvc3ZnPg==",
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
