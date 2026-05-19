import { Router, type IRouter } from "express";
import { desc, eq, and, count, sum } from "drizzle-orm";
import { db, claimsTable, chainsTable } from "@workspace/db";
import { ClaimFaucetBody, GetFaucetStatusParams } from "@workspace/api-zod";
import { sendTokens, isValidEvmAddress } from "../lib/faucet";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyCaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return true; // skip if not configured
  try {
    const res = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`,
      { method: "POST" }
    );
    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}

const router: IRouter = Router();

router.post("/faucet/claim", async (req, res): Promise<void> => {
  const parsed = ClaimFaucetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chainId, address, captchaToken } = parsed.data;

  if (!isValidEvmAddress(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  const captchaValid = await verifyCaptcha(captchaToken);
  if (!captchaValid) {
    res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain) {
    res.status(404).json({ error: "Chain not found or disabled" });
    return;
  }

  if (chain.availableStatus === "NO") {
    res.status(429).json({ error: "This faucet is currently unavailable" });
    return;
  }

  const cooldownMs = chain.cooldownHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);

  const [recent] = await db
    .select()
    .from(claimsTable)
    .where(
      and(
        eq(claimsTable.chainId, chainId),
        eq(claimsTable.address, address.toLowerCase())
      )
    )
    .orderBy(desc(claimsTable.claimedAt))
    .limit(1);

  if (recent && recent.claimedAt > since) {
    const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
    res.status(429).json({
      error: `Already claimed. Next claim at ${nextClaimAt.toISOString()}`,
    });
    return;
  }

  let txHash: string;
  try {
    const result = await sendTokens(
      chain.rpcUrl,
      chain.privateKey,
      address,
      chain.claimAmount
    );
    txHash = result.txHash;
  } catch (err) {
    req.log.error({ err }, "Failed to send tokens");
    res.status(500).json({ error: "Transaction failed. Please try again later." });
    return;
  }

  const [claim] = await db
    .insert(claimsTable)
    .values({
      chainId,
      address: address.toLowerCase(),
      txHash,
      amount: chain.claimAmount,
    })
    .returning();

  res.json({
    txHash: claim.txHash,
    address: claim.address,
    amount: claim.amount,
    symbol: chain.symbol,
    chainName: chain.name,
    claimedAt: claim.claimedAt.toISOString(),
  });
});

router.get("/faucet/status/:chainId/:address", async (req, res): Promise<void> => {
  const rawChainId = Array.isArray(req.params.chainId) ? req.params.chainId[0] : req.params.chainId;
  const rawAddress = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;

  const params = GetFaucetStatusParams.safeParse({ chainId: rawChainId, address: rawAddress });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { chainId, address } = params.data;

  if (!isValidEvmAddress(address)) {
    res.status(400).json({ error: "Invalid EVM address" });
    return;
  }

  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, chainId));
  if (!chain) {
    res.status(404).json({ error: "Chain not found" });
    return;
  }

  const cooldownMs = chain.cooldownHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);

  const [recent] = await db
    .select()
    .from(claimsTable)
    .where(
      and(
        eq(claimsTable.chainId, chainId),
        eq(claimsTable.address, address.toLowerCase())
      )
    )
    .orderBy(desc(claimsTable.claimedAt))
    .limit(1);

  if (!recent || recent.claimedAt <= since) {
    res.json({
      chainId,
      address: address.toLowerCase(),
      canClaim: true,
      nextClaimAt: null,
      lastClaimedAt: recent?.claimedAt.toISOString() ?? null,
    });
    return;
  }

  const nextClaimAt = new Date(recent.claimedAt.getTime() + cooldownMs);
  res.json({
    chainId,
    address: address.toLowerCase(),
    canClaim: false,
    nextClaimAt: nextClaimAt.toISOString(),
    lastClaimedAt: recent.claimedAt.toISOString(),
  });
});

router.get("/faucet/history", async (_req, res): Promise<void> => {
  const claims = await db
    .select({
      id: claimsTable.id,
      chainId: claimsTable.chainId,
      chainName: chainsTable.name,
      symbol: chainsTable.symbol,
      address: claimsTable.address,
      txHash: claimsTable.txHash,
      amount: claimsTable.amount,
      claimedAt: claimsTable.claimedAt,
    })
    .from(claimsTable)
    .innerJoin(chainsTable, eq(claimsTable.chainId, chainsTable.id))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(20);

  res.json(
    claims.map((c) => ({
      id: c.id,
      chainId: c.chainId,
      chainName: c.chainName,
      symbol: c.symbol,
      address: c.address,
      txHash: c.txHash,
      amount: c.amount,
      claimedAt: c.claimedAt.toISOString(),
    }))
  );
});

export default router;
