import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { logger } from "../logger";

const MIST_PER_SUI = 1_000_000_000n;
const SUI_TIMEOUT_MS = 30_000;

function makeClient(rpcUrl: string): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: rpcUrl });
}

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
  const keypair = Ed25519Keypair.fromSecretKey(parsePrivateKey(privateKey));

  const amountMist = BigInt(Math.round(parseFloat(amount) * Number(MIST_PER_SUI)));

  logger.info({ toAddress, amount, amountMist: amountMist.toString() }, "Sending Sui tokens");

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin], toAddress);

  const result = await withTimeout(
    client.signAndExecuteTransaction({ signer: keypair, transaction: tx }),
    SUI_TIMEOUT_MS,
    "Sui signAndExecuteTransaction"
  );

  logger.info({ digest: result.digest, toAddress }, "Sui transaction submitted — waiting for confirmation");

  const confirmed = await withTimeout(
    client.waitForTransaction({ digest: result.digest, options: { showEffects: true } }),
    SUI_TIMEOUT_MS,
    "Sui waitForTransaction"
  );

  const status = confirmed.effects?.status?.status;
  if (status !== "success") {
    throw new Error(`Sui transaction failed on-chain: ${confirmed.effects?.status?.error ?? status}`);
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
