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

  // Get fee data and bump priority fee to ensure inclusion on fast networks (Polygon etc.)
  const feeData = await provider.getFeeData();
  const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei };
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // EIP-1559 — bump priority fee by 20% to avoid getting stuck
    txOverrides.maxFeePerGas = (feeData.maxFeePerGas * 130n) / 100n;
    txOverrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 130n) / 100n;
  } else if (feeData.gasPrice) {
    txOverrides.gasPrice = (feeData.gasPrice * 130n) / 100n;
  }

  const tx = await wallet.sendTransaction(txOverrides);

  logger.info({ txHash: tx.hash, toAddress }, "Transaction submitted");

  // Fire-and-forget confirmation log — does not block the response
  tx.wait(1).then((receipt) => {
    if (receipt && receipt.status === 1) {
      logger.info({ txHash: tx.hash, blockNumber: receipt.blockNumber }, "Transaction confirmed on-chain");
    } else {
      logger.warn({ txHash: tx.hash }, "Transaction may have been reverted or dropped");
    }
  }).catch((err) => {
    logger.warn({ err, txHash: tx.hash }, "Receipt polling failed (tx may still confirm later)");
  });

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
