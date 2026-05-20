import { Router, type IRouter } from "express";
import { eq, desc, count, sql } from "drizzle-orm";
import { db, claimsTable, chainsTable } from "@workspace/db";
import { lookupLimiter } from "../lib/rateLimiters";

const router: IRouter = Router();

router.get("/lookup/:address", lookupLimiter, async (req, res): Promise<void> => {
  const address = String(req.params.address).toLowerCase().trim();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  const [claims, [stats], chains] = await Promise.all([
    db.select().from(claimsTable).where(eq(claimsTable.address, address)).orderBy(desc(claimsTable.claimedAt)).limit(200),
    db.select({
      totalClaims: count(),
      totalEth: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
    }).from(claimsTable).where(eq(claimsTable.address, address)),
    db.select({ id: chainsTable.id, name: chainsTable.name, symbol: chainsTable.symbol }).from(chainsTable),
  ]);

  const chainMap = Object.fromEntries(chains.map(c => [c.id, c]));

  res.json({
    address,
    totalClaims: Number(stats!.totalClaims),
    totalEth: parseFloat(stats!.totalEth).toFixed(6),
    claims: claims.map(c => ({
      chainName: chainMap[c.chainId]?.name ?? `Chain ${c.chainId}`,
      chainSymbol: chainMap[c.chainId]?.symbol ?? "",
      amount: c.amount,
      txHash: c.txHash,
      claimedAt: c.claimedAt.toISOString(),
    })),
  });
});

export default router;
