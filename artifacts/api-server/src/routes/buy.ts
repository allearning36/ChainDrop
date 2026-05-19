import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { db, chainsTable, purchasesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetBuyInfoParams, SubmitBuyBody } from "@workspace/api-zod";
import { sendTokens, isValidEvmAddress } from "../lib/faucet";

const router: IRouter = Router();

const MAINNET_RPC = process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com";
const MIN_AMOUNT_ETH = "0.001";

router.get("/faucet/buy/info/:chainId", async (req, res): Promise<void> => {
  const params = GetBuyInfoParams.safeParse({ chainId: req.params.chainId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chainId" });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, params.data.chainId), eq(chainsTable.isEnabled, true)));

  if (!chain || !chain.buyEnabled) {
    res.status(404).json({ error: "Chain not found or buy not enabled" });
    return;
  }

  const receiveAddress = chain.receiveAddress || chain.walletAddress;

  res.json({
    chainId: chain.id,
    chainName: chain.name,
    symbol: chain.symbol,
    receiveAddress,
    buyRate: chain.buyRate,
    minAmount: MIN_AMOUNT_ETH,
  });
});

router.post("/faucet/buy", async (req, res): Promise<void> => {
  const parsed = SubmitBuyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chainId, userAddress, mainnetTxHash } = parsed.data;

  if (!isValidEvmAddress(userAddress)) {
    res.status(400).json({ error: "Invalid user wallet address" });
    return;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(mainnetTxHash)) {
    res.status(400).json({ error: "Invalid transaction hash format" });
    return;
  }

  const [chain] = await db
    .select()
    .from(chainsTable)
    .where(and(eq(chainsTable.id, chainId), eq(chainsTable.isEnabled, true)));

  if (!chain || !chain.buyEnabled) {
    res.status(404).json({ error: "Chain not found or buy not enabled" });
    return;
  }

  // Check tx not already used
  const [existing] = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.mainnetTxHash, mainnetTxHash))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "This transaction has already been used for a purchase" });
    return;
  }

  // Verify mainnet tx
  let mainnetAmountPaid: string;
  try {
    const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
    const tx = await provider.getTransaction(mainnetTxHash);

    if (!tx) {
      res.status(400).json({ error: "Transaction not found on Ethereum mainnet. Please wait for it to be mined and try again." });
      return;
    }

    const receiveAddress = (chain.receiveAddress || chain.walletAddress).toLowerCase();
    if (!tx.to || tx.to.toLowerCase() !== receiveAddress) {
      res.status(400).json({ error: `Transaction must send ETH to the correct receive address: ${receiveAddress}` });
      return;
    }

    const amountEth = parseFloat(ethers.formatEther(tx.value));
    if (amountEth < parseFloat(MIN_AMOUNT_ETH)) {
      res.status(400).json({ error: `Minimum amount is ${MIN_AMOUNT_ETH} ETH` });
      return;
    }

    mainnetAmountPaid = ethers.formatEther(tx.value);
  } catch (err: any) {
    req.log.error({ err }, "Failed to verify mainnet tx");
    res.status(400).json({ error: "Failed to verify transaction. Please try again." });
    return;
  }

  // Calculate testnet amount: rate = testnet tokens per 1 mainnet ETH
  const rate = parseFloat(chain.buyRate);
  const paid = parseFloat(mainnetAmountPaid);
  const testnetAmount = (paid * rate).toFixed(8);

  // Record purchase as pending
  const [purchase] = await db
    .insert(purchasesTable)
    .values({
      chainId,
      userAddress: userAddress.toLowerCase(),
      mainnetTxHash,
      mainnetAmountPaid,
      status: "pending",
    })
    .returning();

  // Send testnet tokens
  let testnetTxHash: string;
  try {
    const result = await sendTokens(chain.rpcUrl, chain.privateKey, userAddress, testnetAmount);
    testnetTxHash = result.txHash;
  } catch (err) {
    req.log.error({ err }, "Failed to send testnet tokens for purchase");
    res.status(500).json({ error: "Failed to send testnet tokens. Please contact support with your mainnet tx hash." });
    return;
  }

  // Update purchase record as completed
  await db
    .update(purchasesTable)
    .set({ testnetAmountSent: testnetAmount, testnetTxHash, status: "completed" })
    .where(eq(purchasesTable.id, purchase.id));

  res.json({
    testnetTxHash,
    testnetAmountSent: testnetAmount,
    symbol: chain.symbol,
    chainName: chain.name,
  });
});

export default router;
