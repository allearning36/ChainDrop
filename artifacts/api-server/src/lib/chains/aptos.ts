import { Aptos, AptosConfig, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { logger } from "../logger";

const OCTAS_PER_APT = 1e8;

export async function sendAptos(
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const config = new AptosConfig({ fullnode: rpcUrl });
  const aptos = new Aptos(config);

  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKey) });
  const amountOctas = Math.round(parseFloat(amount) * OCTAS_PER_APT);

  logger.info({ toAddress, amount, amountOctas }, "Sending Aptos tokens");

  const txn = await aptos.transferCoinTransaction({
    sender: account.accountAddress,
    recipient: toAddress,
    amount: amountOctas,
  });

  const { hash } = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
  logger.info({ hash, toAddress }, "Aptos transaction submitted — waiting for confirmation");

  await aptos.waitForTransaction({ transactionHash: hash });
  logger.info({ hash, toAddress }, "Aptos transaction confirmed");

  return { txHash: hash };
}

export async function getAptosBalance(rpcUrl: string, address: string): Promise<string> {
  const config = new AptosConfig({ fullnode: rpcUrl });
  const aptos = new Aptos(config);
  const balance = await aptos.getAccountAPTAmount({ accountAddress: address });
  return (balance / OCTAS_PER_APT).toString();
}

export function isValidAptosAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address);
}
