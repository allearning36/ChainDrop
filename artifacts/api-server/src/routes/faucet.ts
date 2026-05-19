import { Router, type IRouter } from "express";
import { desc, eq, sql, count, sum } from "drizzle-orm";
import { db, claimsTable } from "@workspace/db";
import {
  ClaimFaucetBody,
  GetFaucetStatusParams,
} from "@workspace/api-zod";
import {
  isValidEvmAddress,
  sendSepoliaEth,
  getFaucetBalance,
  CLAIM_AMOUNT_ETH,
  COOLDOWN_HOURS,
} from "../lib/faucet";

const router: IRouter = Router();

router.post("/faucet/claim", async (req, res): Promise<void> => {
  const parsed = ClaimFaucetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { address } = parsed.data;

  if (!isValidEvmAddress(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);

  const [recent] = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.address, address.toLowerCase()))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(1);

  if (recent && recent.claimedAt > since) {
    const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
    res.status(429).json({
      error: `Address already claimed. Next claim available at ${nextClaimAt.toISOString()}`,
    });
    return;
  }

  let txHash: string;
  let amount: string;

  try {
    const result = await sendSepoliaEth(address);
    txHash = result.txHash;
    amount = result.amount;
  } catch (err) {
    req.log.error({ err }, "Failed to send Sepolia ETH");
    res.status(500).json({ error: "Failed to send ETH. Please try again later." });
    return;
  }

  const [claim] = await db
    .insert(claimsTable)
    .values({
      address: address.toLowerCase(),
      txHash,
      amount,
    })
    .returning();

  res.json({
    txHash: claim.txHash,
    address: claim.address,
    amount: claim.amount,
    claimedAt: claim.claimedAt.toISOString(),
  });
});

router.get("/faucet/status/:address", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
  const params = GetFaucetStatusParams.safeParse({ address: raw });

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { address } = params.data;

  if (!isValidEvmAddress(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);

  const [recent] = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.address, address.toLowerCase()))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(1);

  if (!recent || recent.claimedAt <= since) {
    res.json({
      address: address.toLowerCase(),
      canClaim: true,
      nextClaimAt: null,
      lastClaimedAt: recent?.claimedAt.toISOString() ?? null,
    });
    return;
  }

  const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
  res.json({
    address: address.toLowerCase(),
    canClaim: false,
    nextClaimAt: nextClaimAt.toISOString(),
    lastClaimedAt: recent.claimedAt.toISOString(),
  });
});

router.get("/faucet/stats", async (req, res): Promise<void> => {
  const [statsRow] = await db
    .select({
      totalClaims: count(claimsTable.id),
      totalEthDistributed: sum(claimsTable.amount),
    })
    .from(claimsTable);

  const faucetBalance = await getFaucetBalance();

  res.json({
    totalClaims: Number(statsRow.totalClaims ?? 0),
    totalEthDistributed: statsRow.totalEthDistributed
      ? parseFloat(statsRow.totalEthDistributed).toFixed(4)
      : "0.0000",
    faucetBalanceEth: faucetBalance,
    claimAmountEth: CLAIM_AMOUNT_ETH,
    cooldownHours: COOLDOWN_HOURS,
  });
});

router.get("/faucet/history", async (req, res): Promise<void> => {
  const claims = await db
    .select()
    .from(claimsTable)
    .orderBy(desc(claimsTable.claimedAt))
    .limit(20);

  res.json(
    claims.map((c) => ({
      id: c.id,
      address: c.address,
      txHash: c.txHash,
      amount: c.amount,
      claimedAt: c.claimedAt.toISOString(),
    }))
  );
});

export default router;
