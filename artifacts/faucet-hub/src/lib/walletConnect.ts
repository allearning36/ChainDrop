import EthereumProvider from "@walletconnect/ethereum-provider";

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

let _provider: EthereumProvider | null = null;

export async function initWalletConnectProvider(): Promise<{
  provider: EthereumProvider;
  uri: string;
}> {
  if (!PROJECT_ID) {
    throw new Error("WalletConnect Project ID not configured. Please set VITE_WALLETCONNECT_PROJECT_ID.");
  }

  if (_provider) {
    try { await _provider.disconnect(); } catch { /* ignore */ }
    _provider = null;
  }

  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [1],
    optionalChains: [8453, 42161, 10, 137],
    methods: [
      "eth_sendTransaction",
      "personal_sign",
      "eth_signTypedData_v4",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
    ],
    showQrModal: false,
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

export function hasWalletConnectProjectId(): boolean {
  return !!PROJECT_ID;
}

/** Opens the dApp inside the wallet's built-in browser — no WalletConnect relay needed */
export const MOBILE_WALLET_LINKS: Array<{
  id: string;
  name: string;
  logo: string;
  color: string;
  getLink: (url: string) => string;
}> = [
  {
    id: "metamask",
    name: "MetaMask",
    logo: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg",
    color: "#E8831D",
    getLink: (url) => {
      const domain = url.replace(/^https?:\/\//, "");
      return `https://metamask.app.link/dapp/${domain}`;
    },
  },
  {
    id: "trust",
    name: "Trust Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trustwallet.com/logo.png",
    color: "#3375BB",
    getLink: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bitget_logo.svg/1200px-Bitget_logo.svg.png",
    color: "#00B897",
    getLink: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    logo: "https://assets.coingecko.com/markets/images/1295/small/Rainbow.jpg",
    color: "#174299",
    getLink: (url) => `https://rnbwapp.com/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/okx.com/logo.png",
    color: "#000000",
    getLink: (url) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    logo: "https://raw.githubusercontent.com/trustwallet/assets/master/dapps/tokenpocket.pro/logo.png",
    color: "#2980FE",
    getLink: (url) =>
      `tpoutside://pull?version=1&params=${encodeURIComponent(JSON.stringify({ action: "open", value: url }))}`,
  },
];
