import { ethers } from "ethers";
import { logger } from "../logger";

export async function sendEvm(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const amountWei = ethers.parseEther(amount);

  logger.info({ toAddress, amount }, "Sending EVM tokens");

  const feeData = await provider.getFeeData();
  const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei };
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    txOverrides.maxFeePerGas = (feeData.maxFeePerGas * 130n) / 100n;
    txOverrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 130n) / 100n;
  } else if (feeData.gasPrice) {
    txOverrides.gasPrice = (feeData.gasPrice * 130n) / 100n;
  }

  const tx = await wallet.sendTransaction(txOverrides);
  logger.info({ txHash: tx.hash, toAddress }, "EVM transaction submitted");

  tx.wait(1).then((receipt) => {
    if (receipt?.status === 1) logger.info({ txHash: tx.hash }, "EVM tx confirmed");
    else logger.warn({ txHash: tx.hash }, "EVM tx may have been reverted");
  }).catch((err) => logger.warn({ err, txHash: tx.hash }, "EVM receipt polling failed"));

  return { txHash: tx.hash };
}

export async function getEvmBalance(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (err) {
    logger.warn({ err }, "Failed to get EVM balance");
    return null;
  }
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}
