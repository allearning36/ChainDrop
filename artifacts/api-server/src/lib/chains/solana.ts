import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import { logger } from "../logger";

function parseKeypair(privateKey: string): Keypair {
  // Accept: base58 string, JSON byte array "[1,2,3...]", or hex
  if (privateKey.startsWith("[")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey) as number[]));
  }
  if (/^[0-9a-fA-F]{128}$/.test(privateKey)) {
    return Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  }
  return Keypair.fromSecretKey(bs58.decode(privateKey));
}

export async function sendSolana(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const connection = new Connection(rpcUrl, "confirmed");
  const keypair = parseKeypair(privateKey);
  const toPubkey = new PublicKey(toAddress);
  const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);

  logger.info({ toAddress, amount, lamports }, "Sending Solana tokens");

  const transaction = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports })
  );

  const txHash = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  logger.info({ txHash, toAddress }, "Solana transaction confirmed");
  return { txHash };
}

export async function getSolanaBalance(rpcUrl: string, address: string): Promise<string> {
  const connection = new Connection(rpcUrl, "confirmed");
  const pubkey = new PublicKey(address);
  const lamports = await connection.getBalance(pubkey);
  return (lamports / LAMPORTS_PER_SOL).toString();
}

export function isValidSolanaAddress(address: string): boolean {
  try { new PublicKey(address); return true; } catch { return false; }
}
