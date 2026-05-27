import { withRpcFailover } from "../rpcFailover";

export type ChainType = "evm" | "solana" | "ton" | "sui" | "aptos" | "custom";

export const CHAIN_TYPES: ChainType[] = ["evm", "solana", "ton", "sui", "aptos", "custom"];

export const CHAIN_TYPE_LABELS: Record<ChainType, string> = {
  evm: "EVM (Ethereum / BSC / Polygon / etc.)",
  solana: "Solana",
  ton: "TON (Toncoin)",
  sui: "Sui",
  aptos: "Aptos",
  custom: "Custom / Other",
};

export const CHAIN_TYPE_ADDRESS_HINT: Record<ChainType, string> = {
  evm: "0x... (40 hex chars)",
  solana: "Base58 public key (e.g. 7EcDh...)",
  ton: "User-friendly address (e.g. EQA...)",
  sui: "0x + 64 hex chars",
  aptos: "0x + up to 64 hex chars",
  custom: "Any address format (validated by regex if set)",
};

export const CHAIN_TYPE_KEY_HINT: Record<ChainType, string> = {
  evm: "0x-prefixed hex private key",
  solana: "Base58 secret key or JSON byte array [1,2,3...]",
  ton: "24-word mnemonic (space-separated)",
  sui: "Hex private key (0x-prefixed or plain 64 hex)",
  aptos: "Hex private key (0x-prefixed or plain 64 hex)",
  custom: "0x-prefixed hex private key (custom chains use EVM-compatible sending)",
};

// ── Lazy-loaded chain modules ────────────────────────────────────────────────

export async function sendTokens(
  chainType: ChainType,
  rpcUrls: string[],
  privateKey: string,
  toAddress: string,
  amount: string,
  options?: { gasPriceGwei?: string | null; gasLimit?: number | null }
): Promise<{ txHash: string }> {
  return withRpcFailover(
    rpcUrls,
    async (rpcUrl) => {
      switch (chainType) {
        case "evm": {
          const { sendEvm } = await import("./evm");
          return sendEvm(rpcUrl, privateKey, toAddress, amount, options?.gasPriceGwei, options?.gasLimit);
        }
        case "solana": {
          const { sendSolana } = await import("./solana");
          return sendSolana(rpcUrl, privateKey, toAddress, amount);
        }
        case "ton": {
          const { sendTon } = await import("./ton");
          return sendTon(rpcUrl, privateKey, toAddress, amount);
        }
        case "sui": {
          const { sendSui } = await import("./sui");
          return sendSui(rpcUrl, privateKey, toAddress, amount);
        }
        case "aptos": {
          const { sendAptos } = await import("./aptos");
          return sendAptos(rpcUrl, privateKey, toAddress, amount);
        }
        case "custom": {
          // Custom chains use EVM-compatible token sending.
          // This covers all EVM-compatible networks (Metis, Celo, Linea, Kava, zkSync, etc.)
          // that aren't listed as a dedicated chain type.
          const { sendEvm } = await import("./evm");
          return sendEvm(rpcUrl, privateKey, toAddress, amount, options?.gasPriceGwei, options?.gasLimit);
        }
      }
    },
    `sendTokens:${chainType}`
  );
}

export async function getWalletBalance(
  chainType: ChainType,
  rpcUrls: string[],
  address: string
): Promise<string | null> {
  try {
    return await withRpcFailover(
      rpcUrls,
      async (rpcUrl) => {
        switch (chainType) {
          case "evm": {
            const { getEvmBalance } = await import("./evm");
            return getEvmBalance(rpcUrl, address);
          }
          case "solana": {
            const { getSolanaBalance } = await import("./solana");
            return getSolanaBalance(rpcUrl, address);
          }
          case "ton": {
            const { getTonBalance } = await import("./ton");
            return getTonBalance(rpcUrl, address);
          }
          case "sui": {
            const { getSuiBalance } = await import("./sui");
            return getSuiBalance(rpcUrl, address);
          }
          case "aptos": {
            const { getAptosBalance } = await import("./aptos");
            return getAptosBalance(rpcUrl, address);
          }
          case "custom": {
            // Custom chains use EVM-compatible balance checking
            const { getEvmBalance } = await import("./evm");
            return getEvmBalance(rpcUrl, address);
          }
        }
      },
      `getBalance:${chainType}`
    );
  } catch {
    return null;
  }
}

export async function isValidAddress(
  chainType: ChainType,
  address: string,
  addressRegex?: string | null
): Promise<boolean> {
  switch (chainType) {
    case "evm": {
      const { isValidEvmAddress } = await import("./evm");
      return isValidEvmAddress(address);
    }
    case "solana": {
      const { isValidSolanaAddress } = await import("./solana");
      return isValidSolanaAddress(address);
    }
    case "ton": {
      const { isValidTonAddress } = await import("./ton");
      return isValidTonAddress(address);
    }
    case "sui": {
      const { isValidSuiAddress } = await import("./sui");
      return isValidSuiAddress(address);
    }
    case "aptos": {
      const { isValidAptosAddress } = await import("./aptos");
      return isValidAptosAddress(address);
    }
    case "custom": {
      if (!address || address.trim().length === 0) return false;
      if (addressRegex) {
        // Support multiple patterns — split by newlines, accept if ANY pattern matches
        const patterns = addressRegex.split("\n").map(p => p.trim()).filter(Boolean);
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern).test(address)) return true;
          } catch { /* skip invalid pattern */ }
        }
        return false;
      }
      return address.trim().length >= 8;
    }
  }
}

// ── Explorer URLs ─────────────────────────────────────────────────────────────

export function getTxExplorerUrl(
  chainType: ChainType,
  isTestnet: boolean,
  txHash: string
): string {
  switch (chainType) {
    case "solana":
      return isTestnet
        ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
        : `https://explorer.solana.com/tx/${txHash}`;
    case "ton":
      return isTestnet
        ? `https://testnet.tonscan.org/tx/${txHash}`
        : `https://tonscan.org/tx/${txHash}`;
    case "sui":
      return isTestnet
        ? `https://testnet.suivision.xyz/txblock/${txHash}`
        : `https://suivision.xyz/txblock/${txHash}`;
    case "aptos":
      return isTestnet
        ? `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`
        : `https://explorer.aptoslabs.com/txn/${txHash}`;
    default: // evm
      return isTestnet
        ? `https://sepolia.etherscan.io/tx/${txHash}`
        : `https://etherscan.io/tx/${txHash}`;
  }
}

export function getAddressExplorerUrl(
  chainType: ChainType,
  isTestnet: boolean,
  address: string
): string {
  switch (chainType) {
    case "solana":
      return isTestnet
        ? `https://explorer.solana.com/address/${address}?cluster=devnet`
        : `https://explorer.solana.com/address/${address}`;
    case "ton":
      return isTestnet
        ? `https://testnet.tonscan.org/address/${address}`
        : `https://tonscan.org/address/${address}`;
    case "sui":
      return isTestnet
        ? `https://testnet.suivision.xyz/address/${address}`
        : `https://suivision.xyz/address/${address}`;
    case "aptos":
      return isTestnet
        ? `https://explorer.aptoslabs.com/account/${address}?network=testnet`
        : `https://explorer.aptoslabs.com/account/${address}`;
    default: {
      const n = address.toLowerCase();
      if (n.includes("polygon") || n.includes("matic")) return `https://polygonscan.com/address/${address}`;
      if (n.includes("bsc") || n.includes("binance")) return `https://bscscan.com/address/${address}`;
      if (n.includes("arbitrum")) return `https://arbiscan.io/address/${address}`;
      if (n.includes("optimism")) return `https://optimistic.etherscan.io/address/${address}`;
      if (isTestnet) return `https://sepolia.etherscan.io/address/${address}`;
      return `https://etherscan.io/address/${address}`;
    }
  }
}
