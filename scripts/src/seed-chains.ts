import { db, chainsTable } from "@workspace/db";
import { ethers } from "ethers";

async function getWalletAddress(): Promise<string> {
  const pk = process.env.FAUCET_PRIVATE_KEY;
  if (!pk) return "0x0000000000000000000000000000000000000000";
  const wallet = new ethers.Wallet(pk);
  return wallet.address;
}

async function seed() {
  const walletAddress = await getWalletAddress();

  const existing = await db.select().from(chainsTable);
  if (existing.length > 0) {
    console.log(`Chains already seeded (${existing.length} found). Skipping.`);
    process.exit(0);
  }

  await db.insert(chainsTable).values([
    {
      name: "Ethereum Sepolia",
      symbol: "ETH",
      logoUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
      rpcUrl: process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
      privateKey: process.env.FAUCET_PRIVATE_KEY ?? "",
      walletAddress,
      claimAmount: "0.05",
      cooldownSeconds: 86400,
      isTestnet: true,
      isEnabled: true,
      availableStatus: "YES",
      buyEnabled: false,
      coingeckoId: "ethereum",
      sortOrder: 0,
    },
  ]);

  console.log("Seeded: Ethereum Sepolia chain");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
