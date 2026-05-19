import EthereumProvider from "@walletconnect/ethereum-provider";

const PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  "c157b4de0fd17600e3d66e9ee68e43f4"; // fallback demo id

let _provider: EthereumProvider | null = null;

export async function initWalletConnectProvider(): Promise<{
  provider: EthereumProvider;
  uri: string;
}> {
  // Disconnect any existing session first
  if (_provider) {
    try { await _provider.disconnect(); } catch { /* ignore */ }
    _provider = null;
  }

  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [1], // Ethereum mainnet required
    optionalChains: [8453, 42161, 10, 137], // Base, Arbitrum, Optimism, Polygon
    showQrModal: false, // We handle our own QR display
    metadata: {
      name: "ChainDrop Faucet",
      description: "Multi-chain testnet faucet",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });

  _provider = provider;

  return new Promise<{ provider: EthereumProvider; uri: string }>((resolve, reject) => {
    provider.once("display_uri", (uri: string) => {
      resolve({ provider, uri });
    });

    provider.connect().catch((err: unknown) => {
      reject(err);
    });
  });
}

export async function disconnectWalletConnect(): Promise<void> {
  if (_provider) {
    try { await _provider.disconnect(); } catch { /* ignore */ }
    _provider = null;
  }
}

/** Popular mobile wallet deep links that support WalletConnect */
export const WALLET_DEEP_LINKS: Array<{
  id: string;
  name: string;
  logo: string;
  getLink: (uri: string) => string;
}> = [
  {
    id: "metamask",
    name: "MetaMask",
    logo: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    getLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trustwallet.com/logo.png",
    getLink: (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bitget_logo.svg/1200px-Bitget_logo.svg.png",
    getLink: (uri) => `https://bkcode.vip/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/tokenpocket.pro/logo.png",
    getLink: (uri) => `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "wc", value: uri }))}`,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    logo: "https://raw.githubusercontent.com/rainbow-me/rainbow/develop/src/assets/rainbow-logo.png",
    getLink: (uri) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/okx.com/logo.png",
    getLink: (uri) => `okex://main/wc?uri=${encodeURIComponent(uri)}`,
  },
];
