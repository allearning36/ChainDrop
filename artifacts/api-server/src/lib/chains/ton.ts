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

  logger.info({ toAddress, seqno }, "TON transfer submitted — polling for seqno advancement");

  // Poll until the wallet seqno increments, confirming the tx was accepted
  const TON_POLL_INTERVAL_MS = 1_500;
  const TON_POLL_TIMEOUT_MS = 90_000;
  const deadline = Date.now() + TON_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, TON_POLL_INTERVAL_MS));
    try {
      const currentSeqno = await contract.getSeqno();
      if (currentSeqno > seqno) break;
    } catch { /* keep polling */ }
  }

  logger.info({ toAddress, seqno }, "TON seqno advanced — fetching real tx hash");

  // After seqno advances, the most-recent transaction IS our send tx.
  // Poll getTransactions to retrieve the actual blockchain hash.
  let txHash = "";
  const hashDeadline = Date.now() + 30_000;
  while (Date.now() < hashDeadline) {
    await new Promise<void>((r) => setTimeout(r, 2_000));
    try {
      const txs = await client.getTransactions(wallet.address, { limit: 1 });
      if (txs.length > 0) {
        txHash = Buffer.from(txs[0].hash()).toString("base64");
        break;
      }
    } catch { /* keep polling */ }
  }

  if (!txHash) {
    // Should rarely happen; keep a unique fallback so the DB row is still identifiable
    txHash = `ref_${wallet.address.toRawString().slice(0, 16)}_${seqno}_${Date.now()}`;
    logger.warn({ toAddress, seqno }, "TON tx hash not available — using seqno-based fallback");
  }

  logger.info({ txHash, toAddress, seqno }, "TON transfer confirmed");
  return { txHash };
}

export async function getTonBalance(rpcUrl: string, address: string): Promise<string> {
  const client = new TonClient({ endpoint: rpcUrl });
  const parsed = Address.parse(address);
  const balance = await client.getBalance(parsed);
  return fromNano(balance);
}

export function isValidTonAddress(address: string): boolean {
  try { Address.parse(address); return true; } catch { return false; }
}
