import { ethers } from "ethers";
import { logger } from "../logger";

const RPC_TIMEOUT_MS = 15_000;
const TX_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function makeProvider(rpcUrl: string): ethers.JsonRpcProvider {
  const req = new ethers.FetchRequest(rpcUrl);
  req.timeout = RPC_TIMEOUT_MS;
  return new ethers.JsonRpcProvider(req);
}

export async function sendEvm(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const provider = makeProvider(rpcUrl);
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const amountWei = ethers.parseEther(amount);

    logger.info({ toAddress, amount }, "Sending EVM tokens");

    const feeData = await withTimeout(
      provider.getFeeData(),
      RPC_TIMEOUT_MS,
      "getFeeData"
    );

    const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei };
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      txOverrides.maxFeePerGas = (feeData.maxFeePerGas * 130n) / 100n;
      txOverrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 130n) / 100n;
    } else if (feeData.gasPrice) {
      txOverrides.gasPrice = (feeData.gasPrice * 130n) / 100n;
    }

    const tx = await withTimeout(
      wallet.sendTransaction(txOverrides),
      TX_TIMEOUT_MS,
      "sendTransaction"
    );

    logger.info({ txHash: tx.hash, toAddress }, "EVM transaction submitted");

    tx.wait(1).then((receipt) => {
      if (receipt?.status === 1) logger.info({ txHash: tx.hash }, "EVM tx confirmed");
      else logger.warn({ txHash: tx.hash }, "EVM tx may have been reverted");
    }).catch((err) => logger.warn({ err, txHash: tx.hash }, "EVM receipt polling failed"));

    return { txHash: tx.hash };
  } finally {
    provider.destroy();
  }
}

export async function getEvmBalance(rpcUrl: string, address: string): Promise<string | null> {
  const provider = makeProvider(rpcUrl);
  try {
    const balance = await withTimeout(
      provider.getBalance(address),
      RPC_TIMEOUT_MS,
      "getBalance"
    );
    return ethers.formatEther(balance);
  } catch (err) {
    logger.warn({ err }, "Failed to get EVM balance");
    return null;
  } finally {
    provider.destroy();
  }
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}
