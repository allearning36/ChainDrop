import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { logger } from "../logger";

const MIST_PER_SUI = 1_000_000_000n;

function makeClient(rpcUrl: string): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });
}

export async function sendSui(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const client = makeClient(rpcUrl);
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);

  const amountMist = BigInt(Math.round(parseFloat(amount) * Number(MIST_PER_SUI)));

  logger.info({ toAddress, amount, amountMist: amountMist.toString() }, "Sending Sui tokens");

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin], toAddress);

  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  logger.info({ digest: result.digest, toAddress }, "Sui transaction submitted — waiting for confirmation");

  const confirmed = await client.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
  const status = confirmed.effects?.status?.status;
  if (status !== "success") {
    throw new Error(`Sui transaction failed on-chain: ${confirmed.effects?.status?.error ?? status}`);
  }
  logger.info({ digest: result.digest, toAddress }, "Sui transaction confirmed");

  return { txHash: result.digest };
}

export async function getSuiBalance(rpcUrl: string, address: string): Promise<string> {
  const client = makeClient(rpcUrl);
  const balance = await client.getBalance({ owner: address });
  return (Number(balance.totalBalance) / Number(MIST_PER_SUI)).toString();
}

export function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}
