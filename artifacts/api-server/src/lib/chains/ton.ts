import { TonClient, WalletContractV4, internal, toNano, fromNano, Address } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { logger } from "../logger";

export async function sendTon(
  rpcUrl: string,
  mnemonic: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length < 12) throw new Error("TON private key must be a mnemonic (12-24 words)");

  const keypair = await mnemonicToPrivateKey(words);
  const client = new TonClient({ endpoint: rpcUrl });
  const wallet = WalletContractV4.create({ publicKey: keypair.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  logger.info({ toAddress, amount }, "Sending TON tokens");

  const seqno = await contract.getSeqno();
  await contract.sendTransfer({
    secretKey: keypair.secretKey,
    seqno,
    messages: [internal({ to: toAddress, value: toNano(amount), bounce: false })],
  });

  // TON doesn't return a tx hash synchronously; encode a unique reference
  const txRef = Buffer.from(
    `${wallet.address.toRawString()}_${seqno}_${Date.now()}`
  ).toString("hex").slice(0, 64);

  logger.info({ txRef, toAddress, seqno }, "TON transfer submitted");
  return { txHash: txRef };
}

export async function getTonBalance(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const client = new TonClient({ endpoint: rpcUrl });
    const parsed = Address.parse(address);
    const balance = await client.getBalance(parsed);
    return fromNano(balance);
  } catch (err) {
    logger.warn({ err }, "Failed to get TON balance");
    return null;
  }
}

export function isValidTonAddress(address: string): boolean {
  try { Address.parse(address); return true; } catch { return false; }
}
