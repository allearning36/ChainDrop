import { ethers } from "ethers";
import { logger } from "./logger";

export async function sendTokens(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amountEth: string
): Promise<{ txHash: string }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const amountWei = ethers.parseEther(amountEth);

  logger.info({ toAddress, amount: amountEth }, "Sending faucet tokens");

  const tx = await wallet.sendTransaction({ to: toAddress, value: amountWei });

  logger.info({ txHash: tx.hash, toAddress }, "Transaction submitted");

  return { txHash: tx.hash };
}

export async function getWalletBalance(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (err) {
    logger.warn({ err }, "Failed to get wallet balance");
    return null;
  }
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}
