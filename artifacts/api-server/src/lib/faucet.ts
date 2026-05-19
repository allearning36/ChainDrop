import { ethers } from "ethers";
import { logger } from "./logger";

const CLAIM_AMOUNT_ETH = "0.05";
const COOLDOWN_HOURS = 24;

export { CLAIM_AMOUNT_ETH, COOLDOWN_HOURS };

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getWallet(): ethers.Wallet {
  const privateKey = process.env.FAUCET_PRIVATE_KEY;
  if (!privateKey) throw new Error("FAUCET_PRIVATE_KEY is not set");
  return new ethers.Wallet(privateKey, getProvider());
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export async function sendSepoliaEth(toAddress: string): Promise<{ txHash: string; amount: string }> {
  const wallet = getWallet();
  const amountWei = ethers.parseEther(CLAIM_AMOUNT_ETH);

  logger.info({ toAddress, amount: CLAIM_AMOUNT_ETH }, "Sending Sepolia ETH");

  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: amountWei,
  });

  logger.info({ txHash: tx.hash, toAddress }, "Transaction submitted");

  return { txHash: tx.hash, amount: CLAIM_AMOUNT_ETH };
}

export async function getFaucetBalance(): Promise<string | null> {
  try {
    const wallet = getWallet();
    const balance = await wallet.provider!.getBalance(wallet.address);
    return ethers.formatEther(balance);
  } catch (err) {
    logger.warn({ err }, "Failed to get faucet balance");
    return null;
  }
}
