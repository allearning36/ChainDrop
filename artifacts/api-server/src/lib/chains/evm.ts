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

export class EvmInsufficientBalanceError extends Error {
  public readonly balance: string = "";
  public readonly required: string = "";
  constructor(balance: string, required: string) {
    super(`Faucet wallet has insufficient funds — balance: ${balance} ETH, required ≥ ${required} ETH (includes gas buffer)`);
    this.name = "EvmInsufficientBalanceError";
    this.balance = balance;
    this.required = required;
    // Set ethers-compatible code so classifyError picks it up reliably
    (this as unknown as Record<string, unknown>).code = "INSUFFICIENT_FUNDS";
  }
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

    // ── Fetch balance and fee data in parallel ────────────────────────────────
    const [balanceWei, feeData] = await Promise.all([
      withTimeout(provider.getBalance(wallet.address), RPC_TIMEOUT_MS, "getBalance"),
      withTimeout(provider.getFeeData(), RPC_TIMEOUT_MS, "getFeeData"),
    ]);

    // ── Build tx overrides with explicit gasLimit for native transfers ─────────
    // Native ETH transfers always use exactly 21 000 gas; setting this explicitly
    // prevents the node from running (and mis-estimating) gas, and lets us
    // accurately predict the maximum fee before sending.
    const GAS_LIMIT = 21_000n;
    const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei, gasLimit: GAS_LIMIT };
    let effectiveGasPrice: bigint;
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      const inflatedMax      = (feeData.maxFeePerGas      * 120n) / 100n;
      const inflatedPriority = (feeData.maxPriorityFeePerGas * 120n) / 100n;
      txOverrides.maxFeePerGas = inflatedMax;
      txOverrides.maxPriorityFeePerGas = inflatedPriority;
      effectiveGasPrice = inflatedMax;
    } else {
      const inflatedGasPrice = ((feeData.gasPrice ?? 1n) * 120n) / 100n;
      txOverrides.gasPrice = inflatedGasPrice;
      effectiveGasPrice = inflatedGasPrice;
    }

    // ── Pre-flight: verify wallet can cover amount + max gas cost ─────────────
    const maxGasCost = GAS_LIMIT * effectiveGasPrice;
    const totalRequired = amountWei + maxGasCost;
    if (balanceWei < totalRequired) {
      const balanceEth  = ethers.formatEther(balanceWei);
      const requiredEth = ethers.formatEther(totalRequired);
      logger.warn(
        { balance: balanceEth, required: requiredEth, gasPrice: effectiveGasPrice.toString(), walletAddress: wallet.address },
        "Insufficient faucet wallet balance (amount + gas)"
      );
      throw new EvmInsufficientBalanceError(balanceEth, requiredEth);
    }
    // ─────────────────────────────────────────────────────────────────────────

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
