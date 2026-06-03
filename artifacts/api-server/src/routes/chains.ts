import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, chainsTable } from "@workspace/db";
import { GetChainsQueryParams, GetChainParams } from "@workspace/api-zod";
import { getWalletBalance, deriveWalletAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { resolveChainWalletAddress, resolveChainPrivateKey } from "../lib/encryption";
import { getCached, setCached } from "../lib/cache";

const router: IRouter = Router();

type ChainRow = typeof chainsTable.$inferSelect;

router.get("/chains", async (req, res): Promise<void> => {
  const query = GetChainsQueryParams.safeParse(req.query);

  // Serve all enabled chains from cache (60s TTL) — filter by type in memory
  let allRows = getCached<ChainRow[]>("chains:enabled");
  if (!allRows) {
    allRows = await db
      .select()
      .from(chainsTable)
      .where(eq(chainsTable.isEnabled, true))
      .orderBy(desc(chainsTable.isPinned), asc(chainsTable.sortOrder), asc(chainsTable.id));
    setCached("chains:enabled", allRows, 60_000);
  }

  let rows = allRows;
  if (query.success && query.data.type) {
    const isTestnet = query.data.type === "testnet";
    rows = rows.filter((c) => c.isTestnet === isTestnet);
  }

  res.json(
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      chainId: c.chainId,
      chainType: c.chainType,
      logoUrl: c.logoUrl,
      claimAmount: c.claimAmount,
      cooldownSeconds: c.cooldownSeconds,
      isTestnet: c.isTestnet,
      isEnabled: c.isEnabled,
      isPinned: c.isPinned,
      availableStatus: c.availableStatus,
      soonMessage: c.soonMessage ?? null,
      buyEnabled: c.isTestnet ? c.buyEnabled : false,
      buyUrl: c.isTestnet ? c.buyUrl : null,
      buyRate: c.isTestnet ? c.buyRate : null,
      rpcUrl: c.rpcUrl ?? null,
      explorerUrl: c.explorerUrl,
      tokenPrice: c.tokenPrice,
      coingeckoId: c.coingeckoId,
      adClaimEnabled: c.adClaimEnabled,
      adClaimAmount: c.adClaimAmount ?? null,
      adDurationSeconds: c.adDurationSeconds,
      adCooldownSeconds: c.adCooldownSeconds,
      captchaEnabled: c.captchaEnabled,
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

  // Resolve wallet address: stored value first, then derive from private key for non-EVM chains
  let walletAddr = resolveChainWalletAddress(chain.walletAddress);
  if (!walletAddr && chain.privateKey) {
    try {
      const { resolveChainPrivateKey } = await import("../lib/encryption");
      const pk = resolveChainPrivateKey(chain.privateKey);
      walletAddr = await deriveWalletAddress(chain.chainType as ChainType, pk);
    } catch { walletAddr = ""; }
  }

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
  const walletBalanceEth = walletAddr ? await Promise.race([
    getWalletBalance(
      chain.chainType as ChainType,
      parseRpcUrls(chain.rpcUrls, chain.rpcUrl),
      walletAddr
    ),
    timeout,
  ]) : null;

  res.json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    chainId: chain.chainId,
    chainType: chain.chainType,
    logoUrl: chain.logoUrl,
    claimAmount: chain.claimAmount,
    cooldownSeconds: chain.cooldownSeconds,
    isTestnet: chain.isTestnet,
    isEnabled: chain.isEnabled,
    isPinned: chain.isPinned,
    availableStatus: chain.availableStatus,
    soonMessage: chain.soonMessage ?? null,
    buyEnabled: chain.isTestnet ? chain.buyEnabled : false,
    buyUrl: chain.isTestnet ? chain.buyUrl : null,
    rpcUrl: chain.rpcUrl ?? null,
    explorerUrl: chain.explorerUrl,
    tokenPrice: chain.tokenPrice,
    coingeckoId: chain.coingeckoId,
    adClaimEnabled: chain.adClaimEnabled,
    adClaimAmount: chain.adClaimAmount ?? null,
    adDurationSeconds: chain.adDurationSeconds,
    adCooldownSeconds: chain.adCooldownSeconds,
    sortOrder: chain.sortOrder,
    walletBalanceEth,
  });
});

export default router;
