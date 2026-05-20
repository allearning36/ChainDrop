import { ethers } from "ethers";
import { logger } from "./logger";

export class InsufficientBalanceError extends Error {
  public readonly balance: string;
  public readonly required: string;
  constructor(balance: string, required: string) {
    super(`Faucet wallet has insufficient funds — balance: ${balance} ETH, required: ${required} ETH`);
    this.name = "InsufficientBalanceError";
    this.balance = balance;
    this.required = required;
    // Ensure ethers-style error classification picks this up
    (this as unknown as Record<string, unknown>).code = "INSUFFICIENT_FUNDS";
  }
}

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

  // Pre-flight: check wallet balance before attempting to send
  const balanceWei = await provider.getBalance(wallet.address);
  // Require at least 1.05× the claim amount to also cover gas
  const minRequired = (amountWei * 105n) / 100n;
  if (balanceWei < minRequired) {
    const balanceEth = ethers.formatEther(balanceWei);
    logger.warn({ balance: balanceEth, required: amountEth, address: wallet.address }, "Insufficient faucet wallet balance");
    throw new InsufficientBalanceError(balanceEth, amountEth);
  }

  // Get fee data and bump priority fee to ensure inclusion on fast networks (Polygon etc.)
  const feeData = await provider.getFeeData();
  const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei };
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // EIP-1559 — bump priority fee by 30% to avoid getting stuck
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
