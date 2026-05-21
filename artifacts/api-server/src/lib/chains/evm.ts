import { ethers } from "ethers";
import { logger } from "../logger";

const RPC_TIMEOUT_MS = 15_000;
const TX_TIMEOUT_MS = 30_000;
const TX_CONFIRM_TIMEOUT_MS = 120_000;

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
  constructor(balance: string, required: string, gasRelated = false) {
    super(`Faucet wallet has insufficient funds — balance: ${balance}, required ≥ ${required} (including gas)`);
    this.name = "EvmInsufficientBalanceError";
    this.balance = balance;
    this.required = required;
    // gasRelated = true means wallet has tokens but not enough to cover gas on top of the send amount
    (this as unknown as Record<string, unknown>).code = gasRelated ? "WALLET_GAS_LOW" : "INSUFFICIENT_FUNDS";
  }
}

export async function sendEvm(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string,
  gasPriceGwei?: string | null
): Promise<{ txHash: string }> {
  const provider = makeProvider(rpcUrl);
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const amountWei = ethers.parseEther(amount);

    const GAS_LIMIT = 21_000n;
    logger.info({ toAddress, amount, gasPriceGwei: gasPriceGwei ?? "auto" }, "Sending EVM tokens");

    let balanceWei: bigint;
    let effectiveGasPrice: bigint;
    const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei, gasLimit: GAS_LIMIT };

    if (gasPriceGwei) {
      // ── Manual gas price override (set by admin per chain) ──────────────────
      const customWei = ethers.parseUnits(gasPriceGwei, "gwei");
      txOverrides.gasPrice = customWei;
      effectiveGasPrice = customWei;
      balanceWei = await withTimeout(provider.getBalance(wallet.address), RPC_TIMEOUT_MS, "getBalance");
    } else {
      // ── Auto: fetch balance and fee data in parallel ─────────────────────────
      const [bal, feeData] = await Promise.all([
        withTimeout(provider.getBalance(wallet.address), RPC_TIMEOUT_MS, "getBalance"),
        withTimeout(provider.getFeeData(), RPC_TIMEOUT_MS, "getFeeData"),
      ]);
      balanceWei = bal;

      // Native ETH transfers always use 21 000 gas; explicit limit prevents
      // the node mis-estimating and lets us predict the maximum cost upfront.
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
    }

    // ── Pre-flight: wallet must cover amount + worst-case gas ─────────────────
    const maxGasCost    = GAS_LIMIT * effectiveGasPrice;
    const totalRequired = amountWei + maxGasCost;
    if (balanceWei < totalRequired) {
      const balanceEth  = ethers.formatEther(balanceWei);
      const requiredEth = ethers.formatEther(totalRequired);
      // gasRelated=true when the wallet has SOME balance but gas tips it over
      const gasRelated = balanceWei >= amountWei;
      logger.warn(
        { balance: balanceEth, required: requiredEth, gasPrice: effectiveGasPrice.toString(), gasRelated, walletAddress: wallet.address },
        gasRelated
          ? "Faucet balance too low to cover gas on top of send amount"
          : "Faucet wallet is empty / insufficient"
      );
      throw new EvmInsufficientBalanceError(balanceEth, requiredEth, gasRelated);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const tx = await withTimeout(
      wallet.sendTransaction(txOverrides),
      TX_TIMEOUT_MS,
      "sendTransaction"
    );

    logger.info({ txHash: tx.hash, toAddress }, "EVM transaction submitted — waiting for confirmation");

    const receipt = await withTimeout(tx.wait(1), TX_CONFIRM_TIMEOUT_MS, "waitForConfirmation");
    if (!receipt || receipt.status !== 1) {
      throw new Error(`EVM transaction reverted on-chain (txHash: ${tx.hash})`);
    }

    logger.info({ txHash: tx.hash, toAddress, blockNumber: receipt.blockNumber }, "EVM transaction confirmed");

    return { txHash: tx.hash };
  } finally {
    provider.destroy();
  }
}

export async function getEvmBalance(rpcUrl: string, address: string): Promise<string> {
  const provider = makeProvider(rpcUrl);
  try {
    const balance = await withTimeout(
      provider.getBalance(address),
      RPC_TIMEOUT_MS,
      "getBalance"
    );
    return ethers.formatEther(balance);
  } finally {
    provider.destroy();
  }
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}
