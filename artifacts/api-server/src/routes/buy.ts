import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { db, chainsTable, purchasesTable, paymentNetworksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { GetBuyInfoParams, SubmitBuyBody } from "@workspace/api-zod";
import { sendTokens as sendChainTokens, isValidAddress, type ChainType } from "../lib/chains/index";
import { parseRpcUrls } from "../lib/rpcFailover";
import { buyLimiter } from "../lib/rateLimiters";
import { resolveChainPrivateKey, resolveChainWalletAddress } from "../lib/encryption";
import { creditCommissions, getReferralSettings } from "../lib/referral";

const router: IRouter = Router();

export const PAYMENT_NETWORKS: Record<string, { name: string; symbol: string; chainId: number; rpcUrl: string }> = {
  eth:       { name: "Ethereum Mainnet", symbol: "ETH",   chainId: 1,     rpcUrl: process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com" },
  base:      { name: "Base",            symbol: "ETH",   chainId: 8453,  rpcUrl: "https://mainnet.base.org" },
  arbitrum:  { name: "Arbitrum One",    symbol: "ETH",   chainId: 42161, rpcUrl: "https://arb1.arbitrum.io/rpc" },
  optimism:  { name: "OP Mainnet",      symbol: "ETH",   chainId: 10,    rpcUrl: "https://mainnet.optimism.io" },
  polygon:   { name: "Polygon",         symbol: "POL",   chainId: 137,   rpcUrl: "https://polygon-rpc.com" },
};

async function getAllPaymentNetworks(): Promise<Record<string, { name: string; symbol: string; chainId: number; rpcUrl: string }>> {
  const customNetworks = await db.select().from(paymentNetworksTable).where(eq(paymentNetworksTable.isEnabled, true));
  const merged = { ...PAYMENT_NETWORKS };
  for (const n of customNetworks) {
    if (!merged[n.networkId]) {
      merged[n.networkId] = { name: n.name, symbol: n.symbol, chainId: n.chainId, rpcUrl: n.rpcUrl };
    }
  }
  return merged;
}

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
  let enabledNetworkIds: string[] = ["eth"];
  try {
    enabledNetworkIds = JSON.parse(chain.buyCurrencies);
  } catch {
    enabledNetworkIds = ["eth"];
  }

  const allNetworks = await getAllPaymentNetworks();
  const networks = enabledNetworkIds
    .filter((id) => allNetworks[id])
    .map((id) => ({ id, ...allNetworks[id] }));

  res.json({
    chainId: chain.id,
    chainName: chain.name,
    symbol: chain.symbol,
    receiveAddress,
    buyRate: chain.buyRate,
    minAmount: chain.buyMinAmount,
    maxAmount: chain.buyMaxAmount ?? null,
    networks,
  });
});

router.post("/faucet/buy", buyLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitBuyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chainId, userAddress, mainnetTxHash, networkId } = parsed.data;

  if (!/^0x[a-fA-F0-9]{64}$/.test(mainnetTxHash)) {
    res.status(400).json({ error: "Invalid transaction hash format" });
    return;
  }

  const allNetworks = await getAllPaymentNetworks();
  const network = allNetworks[networkId];
  if (!network) {
    res.status(400).json({ error: `Unsupported payment network: ${networkId}` });
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

  // Validate the user's address against the actual chain type (EVM, Solana, TON, etc.)
  const addressValid = await isValidAddress(chain.chainType as ChainType, userAddress);
  if (!addressValid) {
    res.status(400).json({ error: "Invalid user wallet address for this chain" });
    return;
  }

  // Verify this network is enabled for this chain
  let enabledNetworkIds: string[] = ["eth"];
  try { enabledNetworkIds = JSON.parse(chain.buyCurrencies); } catch { /* keep default */ }
  if (!enabledNetworkIds.includes(networkId)) {
    res.status(400).json({ error: `Payment via ${network.name} is not enabled for this chain` });
    return;
  }

  // Check tx not already used
  const [existing] = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.mainnetTxHash, mainnetTxHash))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "This transaction has already been used" });
    return;
  }

  // Verify tx on the chosen network
  let mainnetAmountPaid: string;
  try {
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const tx = await provider.getTransaction(mainnetTxHash);

    if (!tx) {
      res.status(400).json({ error: `Transaction not found on ${network.name}. Wait for confirmation and try again.` });
      return;
    }

    const receiveAddress = (chain.receiveAddress || resolveChainWalletAddress(chain.walletAddress)).toLowerCase();
    if (!tx.to || tx.to.toLowerCase() !== receiveAddress) {
      res.status(400).json({ error: `Transaction must send to: ${receiveAddress}` });
      return;
    }

    const amountEth = parseFloat(ethers.formatEther(tx.value));
    const minAmount = parseFloat(chain.buyMinAmount);
    if (amountEth < minAmount) {
      res.status(400).json({ error: `Minimum amount is ${chain.buyMinAmount} ETH` });
      return;
    }
    if (chain.buyMaxAmount) {
      const maxAmount = parseFloat(chain.buyMaxAmount);
      if (amountEth > maxAmount) {
        res.status(400).json({ error: `Maximum amount is ${chain.buyMaxAmount} ETH` });
        return;
      }
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
    const result = await sendChainTokens(chain.chainType as ChainType, parseRpcUrls(chain.rpcUrls, chain.rpcUrl), resolveChainPrivateKey(chain.privateKey), userAddress, testnetAmount);
    testnetTxHash = result.txHash;
  } catch (err) {
    req.log.error({ err }, "Failed to send testnet tokens for purchase");
    res.status(500).json({ error: "Failed to send testnet tokens. Contact support with your mainnet tx hash." });
    return;
  }

  await db
    .update(purchasesTable)
    .set({ testnetAmountSent: testnetAmount, testnetTxHash, status: "completed" })
    .where(eq(purchasesTable.id, purchase.id));

  // Referral commission (fire-and-forget)
  void getReferralSettings().then(async settings => {
    if (settings.commissionOnBuy && (settings.buyChainIds.length === 0 || settings.buyChainIds.includes(chain.id))) {
      await creditCommissions({
        refereeAddress: userAddress,
        sourceType: "buy",
        sourceId: purchase.id,
        chainId: chain.id,
        amountEth: testnetAmount,
        settings,
      });
    }
  }).catch(() => {/* non-critical */});

  res.json({
    testnetTxHash,
    testnetAmountSent: testnetAmount,
    symbol: chain.symbol,
    chainName: chain.name,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /faucet/buy/history/user?wallet= — user buy history
// ─────────────────────────────────────────────────────────────────────────────
router.get("/faucet/buy/history/user", async (req, res): Promise<void> => {
  const wallet = (req.query.wallet as string | undefined)?.toLowerCase();
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  const rows = await db
    .select({
      id: purchasesTable.id,
      chainId: purchasesTable.chainId,
      mainnetAmountPaid: purchasesTable.mainnetAmountPaid,
      testnetAmountSent: purchasesTable.testnetAmountSent,
      mainnetTxHash: purchasesTable.mainnetTxHash,
      testnetTxHash: purchasesTable.testnetTxHash,
      status: purchasesTable.status,
      createdAt: purchasesTable.createdAt,
      chainName: chainsTable.name,
      chainSymbol: chainsTable.symbol,
      explorerUrl: chainsTable.explorerUrl,
    })
    .from(purchasesTable)
    .leftJoin(chainsTable, eq(purchasesTable.chainId, chainsTable.id))
    .where(eq(purchasesTable.userAddress, wallet))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
