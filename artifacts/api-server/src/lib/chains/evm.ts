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
    (this as unknown as Record<string, unknown>).code = gasRelated ? "WALLET_GAS_LOW" : "INSUFFICIENT_FUNDS";
  }
}

export async function sendEvm(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string,
  gasPriceGwei?: string | null,
  gasLimit?: number | null
): Promise<{ txHash: string }> {
  const provider = makeProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const amountWei = ethers.parseEther(amount);

  // ── Phase 1: fee overrides + balance ─────────────────────────────────────
  let balanceWei: bigint;
  let effectiveGasPrice: bigint;
  const txOverrides: Record<string, unknown> = { to: toAddress, value: amountWei };

  if (gasPriceGwei) {
    // Manual gas price override set by admin
    const customWei = ethers.parseUnits(gasPriceGwei, "gwei");
    txOverrides.gasPrice = customWei;
    effectiveGasPrice = customWei;
    balanceWei = await withTimeout(provider.getBalance(wallet.address), RPC_TIMEOUT_MS, "getBalance");
  } else {
    // Auto: fetch live fee data from network (EIP-1559 when available, legacy fallback)
    const [bal, feeData] = await Promise.all([
      withTimeout(provider.getBalance(wallet.address), RPC_TIMEOUT_MS, "getBalance"),
      withTimeout(provider.getFeeData(), RPC_TIMEOUT_MS, "getFeeData"),
    ]);
    balanceWei = bal;

    if (feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null) {
      // EIP-1559 path — Arbitrum returns maxPriorityFeePerGas = 0n (falsy but valid)
      const inflatedMax      = (feeData.maxFeePerGas * 120n) / 100n;
      const inflatedPriority = feeData.maxPriorityFeePerGas > 0n
        ? (feeData.maxPriorityFeePerGas * 120n) / 100n
        : feeData.maxPriorityFeePerGas; // keep 0n for zero-tip chains like Arbitrum
      txOverrides.maxFeePerGas = inflatedMax;
      txOverrides.maxPriorityFeePerGas = inflatedPriority;
      effectiveGasPrice = inflatedMax;
    } else {
      const inflatedGasPrice = ((feeData.gasPrice ?? 1n) * 120n) / 100n;
      txOverrides.gasPrice = inflatedGasPrice;
      effectiveGasPrice = inflatedGasPrice;
    }
  }

  // ── Phase 2: determine gas limit ─────────────────────────────────────────
  // Admin override → use that. Otherwise: ask the network (handles Arbitrum
  // L1 data fees, token contracts, and any chain-specific overhead).
  let GAS_LIMIT: bigint;
  if (gasLimit != null) {
    GAS_LIMIT = BigInt(gasLimit);
    logger.info({ toAddress, amount, gasLimit: GAS_LIMIT.toString(), source: "admin" }, "Using admin-set gas limit");
  } else {
    try {
      const estimated = await withTimeout(
        provider.estimateGas({ to: toAddress, value: amountWei, from: wallet.address }),
        RPC_TIMEOUT_MS,
        "estimateGas"
      );
      // 30% safety buffer — same as MetaMask "Normal" mode
      GAS_LIMIT = (estimated * 130n) / 100n;
      logger.info({ toAddress, amount, estimated: estimated.toString(), withBuffer: GAS_LIMIT.toString() }, "Gas estimated from network");
    } catch (estimateErr) {
      // estimateGas failing usually means the tx would revert — but let the
      // actual sendTransaction surface a cleaner error. Fall back to a safe
      // upper bound so we can still attempt the send.
      GAS_LIMIT = 100_000n;
      logger.warn({ estimateErr, toAddress }, "estimateGas failed — falling back to 100 000");
    }
  }

  txOverrides.gasLimit = GAS_LIMIT;

  // ── Phase 3: pre-flight balance check ────────────────────────────────────
  const maxGasCost    = GAS_LIMIT * effectiveGasPrice;
  const totalRequired = amountWei + maxGasCost;
  if (balanceWei < totalRequired) {
    const balanceEth  = ethers.formatEther(balanceWei);
    const requiredEth = ethers.formatEther(totalRequired);
    const gasRelated  = balanceWei >= amountWei;
    logger.warn(
      { balance: balanceEth, required: requiredEth, gasPrice: effectiveGasPrice.toString(), gasRelated, walletAddress: wallet.address },
      gasRelated
        ? "Faucet balance too low to cover gas on top of send amount"
        : "Faucet wallet is empty / insufficient"
    );
    throw new EvmInsufficientBalanceError(balanceEth, requiredEth, gasRelated);
  }

  // ── Phase 4: send ────────────────────────────────────────────────────────
  const tx = await withTimeout(
    wallet.sendTransaction(txOverrides),
    TX_TIMEOUT_MS,
    "sendTransaction"
  );

  logger.info({ txHash: tx.hash, toAddress, gasLimit: GAS_LIMIT.toString() }, "EVM transaction submitted");

  // Fire-and-forget confirmation — return txHash immediately so the user
  // doesn't have to wait for on-chain inclusion (can take seconds to minutes
  // depending on network congestion and block time).
  tx.wait(1).then((receipt) => {
    if (!receipt || receipt.status !== 1) {
      logger.warn({ txHash: tx.hash, toAddress }, "EVM transaction may have reverted");
    } else {
      logger.info({ txHash: tx.hash, toAddress, blockNumber: receipt.blockNumber }, "EVM transaction confirmed");
    }
  }).catch((err) => {
    logger.warn({ err, txHash: tx.hash }, "EVM confirmation polling failed (tx may still confirm)");
  }).finally(() => {
    provider.destroy();
  });

  return { txHash: tx.hash };
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
