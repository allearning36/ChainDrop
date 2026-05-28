import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { logger } from "../logger";

const MIST_PER_SUI = 1_000_000_000n;
const SUI_TIMEOUT_MS = 30_000;

function makeClient(rpcUrl: string): SuiJsonRpcClient {
  const lower = rpcUrl.toLowerCase();
  const network = lower.includes("testnet") ? "testnet" : lower.includes("devnet") ? "devnet" : "mainnet";
  return new SuiJsonRpcClient({ url: rpcUrl, network });
}

/**
 * Parse private key into the format Ed25519Keypair.fromSecretKey accepts:
 * - Bech32 string (suiprivkey1...) → pass through
 * - 64-char hex (with or without 0x) → convert to Uint8Array
 * - Anything else → pass through (fromSecretKey will throw a clear error)
 */
function parsePrivateKey(privateKey: string): Uint8Array | string {
  if (privateKey.startsWith("suiprivkey1")) return privateKey;
  const hex = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  return privateKey;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function getSuiWalletAddress(privateKey: string): string {
  const keypair = Ed25519Keypair.fromSecretKey(parsePrivateKey(privateKey));
  return keypair.toSuiAddress();
}

export async function sendSui(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const client = makeClient(rpcUrl);

  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(parsePrivateKey(privateKey));
  } catch (err) {
    throw new Error(`Sui private key invalid: ${err instanceof Error ? err.message : String(err)}`);
  }

  const walletAddress = keypair.toSuiAddress();
  const amountMist = BigInt(Math.round(parseFloat(amount) * Number(MIST_PER_SUI)));

  logger.info({ toAddress, amount, amountMist: amountMist.toString(), walletAddress }, "Sending Sui tokens");

  // Pre-flight: check balance before attempting to send
  try {
    const balanceData = await withTimeout(
      client.getBalance({ owner: walletAddress }),
      10_000,
      "Sui getBalance pre-check"
    );
    const balanceMist = BigInt(balanceData.totalBalance);
    // Require at least 110% of claim amount to cover gas
    const minRequired = (amountMist * 110n) / 100n;
    if (balanceMist < minRequired) {
      const balanceSui = (Number(balanceMist) / Number(MIST_PER_SUI)).toFixed(6);
      throw new Error(`insufficient balance: faucet has ${balanceSui} SUI, needs ${amount} SUI`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("insufficient balance")) throw err;
    // Balance check failed (RPC error) — log and continue attempting the transaction
    logger.warn({ err }, "Sui balance pre-check failed, proceeding anyway");
  }

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin], toAddress);

  let result: { digest: string };
  try {
    result = await withTimeout(
      client.signAndExecuteTransaction({ signer: keypair, transaction: tx }),
      SUI_TIMEOUT_MS,
      "Sui signAndExecuteTransaction"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Translate common SUI SDK errors into recognisable messages
    if (msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("insufficient")) {
      throw new Error(`insufficient balance: ${msg}`);
    }
    throw err;
  }

  logger.info({ digest: result.digest, toAddress }, "Sui transaction submitted — waiting for confirmation");

  const confirmed = await withTimeout(
    client.waitForTransaction({ digest: result.digest, options: { showEffects: true } }),
    SUI_TIMEOUT_MS,
    "Sui waitForTransaction"
  );

  const status = confirmed.effects?.status?.status;
  if (status !== "success") {
    const onChainErr = confirmed.effects?.status?.error ?? status ?? "unknown";
    // InsufficientGas / InsufficientCoinBalance etc. → map to recognisable message
    if (
      onChainErr.toLowerCase().includes("insufficientgas") ||
      onChainErr.toLowerCase().includes("insufficientcoin") ||
      onChainErr.toLowerCase().includes("insufficient")
    ) {
      throw new Error(`insufficient balance for Sui transaction: ${onChainErr}`);
    }
    throw new Error(`Sui transaction failed on-chain: ${onChainErr}`);
  }

  logger.info({ digest: result.digest, toAddress }, "Sui transaction confirmed");
  return { txHash: result.digest };
}

export async function getSuiBalance(rpcUrl: string, address: string): Promise<string> {
  const client = makeClient(rpcUrl);
  const balance = await withTimeout(
    client.getBalance({ owner: address }),
    SUI_TIMEOUT_MS,
    "Sui getBalance"
  );
  return (Number(balance.totalBalance) / Number(MIST_PER_SUI)).toString();
}

export function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}
