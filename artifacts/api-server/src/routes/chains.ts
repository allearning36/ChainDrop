import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, chainsTable } from "@workspace/db";
import { GetChainsQueryParams, GetChainParams } from "@workspace/api-zod";
import { getWalletBalance } from "../lib/faucet";

const router: IRouter = Router();

router.get("/chains", async (req, res): Promise<void> => {
  const query = GetChainsQueryParams.safeParse(req.query);

  let rows = await db
    .select()
    .from(chainsTable)
    .where(eq(chainsTable.isEnabled, true))
    .orderBy(asc(chainsTable.sortOrder), asc(chainsTable.id));

  if (query.success && query.data.type) {
    const isTestnet = query.data.type === "testnet";
    rows = rows.filter((c) => c.isTestnet === isTestnet);
  }

  res.json(
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      logoUrl: c.logoUrl,
      claimAmount: c.claimAmount,
      cooldownHours: c.cooldownHours,
      isTestnet: c.isTestnet,
      isEnabled: c.isEnabled,
      availableStatus: c.availableStatus,
      buyEnabled: c.isTestnet ? c.buyEnabled : false,
      buyUrl: c.isTestnet ? c.buyUrl : null,
      tokenPrice: c.tokenPrice,
      coingeckoId: c.coingeckoId,
      sortOrder: c.sortOrder,
    }))
  );
});

router.get("/chains/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetChainParams.safeParse({ id: raw });

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(eq(chainsTable.id, params.data.id));

  if (!chain) {
    res.status(404).json({ error: "Chain not found" });
    return;
  }

  const walletBalanceEth = await getWalletBalance(chain.rpcUrl, chain.walletAddress);

  res.json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    logoUrl: chain.logoUrl,
    claimAmount: chain.claimAmount,
    cooldownHours: chain.cooldownHours,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    availableStatus: chain.availableStatus,
    buyEnabled: chain.isTestnet ? chain.buyEnabled : false,
    buyUrl: chain.isTestnet ? chain.buyUrl : null,
    tokenPrice: chain.tokenPrice,
    coingeckoId: chain.coingeckoId,
    sortOrder: chain.sortOrder,
    walletBalanceEth,
  });
});

export default router;
