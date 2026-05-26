import { ethers } from "ethers";
import { db } from "@workspace/db";
import { referralsTable, referralCommissionsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { convertToEth, registerCoingeckoId } from "./priceCache";

export interface FaucetClaimChainCommission {
  chainId: number;
  level1Pct: number;
  level2Pct: number;
  enabled: boolean;
}

export interface ReferralSettings {
  enabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  // Exchange commission
  commissionOnExchange: boolean;
  exchangeLevel1Pct: number;
  exchangeLevel2Pct: number;
  exchangeChainIds: number[];
  // Buy commission
  commissionOnBuy: boolean;
  buyLevel1Pct: number;
  buyLevel2Pct: number;
  buyChainIds: number[];
  // Faucet Claim commission: per-chain
  faucetClaimChainCommissions: FaucetClaimChainCommission[];
  // Claim payout chains
  claimChainIds: number[];
  minClaimEth: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: true,
  maintenanceMode: false,
  maintenanceMessage: "Referral System Coming Soon...",
  commissionOnExchange: true,
  exchangeLevel1Pct: 1,
  exchangeLevel2Pct: 0.5,
  exchangeChainIds: [],
  commissionOnBuy: true,
  buyLevel1Pct: 1,
  buyLevel2Pct: 0.5,
  buyChainIds: [],
  faucetClaimChainCommissions: [],
  claimChainIds: [],
  minClaimEth: 0.001,
};

export async function getReferralSettings(): Promise<ReferralSettings> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "referralSettings")).limit(1);
  if (!row?.value) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } as ReferralSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveReferralSettings(settings: Partial<ReferralSettings>): Promise<ReferralSettings> {
  const current = await getReferralSettings();
  const next = { ...current, ...settings };
  await db
    .insert(settingsTable)
    .values({ key: "referralSettings", value: JSON.stringify(next) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(next) } });
  return next;
}

export async function getReferrer(address: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.refereeAddress, address.toLowerCase()))
    .limit(1);
  return row?.referrerAddress ?? null;
}

export async function recordCommission(params: {
  referrerAddress: string;
  refereeAddress: string;
  level: number;
  sourceType: "exchange" | "buy" | "faucet_claim";
  sourceId?: number;
  chainId: number;
  baseAmountEth: string;
  pct: number;
}): Promise<void> {
  const commission = (parseFloat(params.baseAmountEth) * params.pct) / 100;
  if (commission <= 0) return;
  try {
    await db.insert(referralCommissionsTable).values({
      referrerAddress: params.referrerAddress.toLowerCase(),
      refereeAddress: params.refereeAddress.toLowerCase(),
      level: params.level,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      chainId: params.chainId,
      amountEth: commission.toFixed(10),
      commissionPct: params.pct.toString(),
      status: "pending",
    });
  } catch (err) {
    logger.error({ err, params }, "Failed to record referral commission");
  }
}

export async function creditCommissions(params: {
  refereeAddress: string;
  sourceType: "exchange" | "buy" | "faucet_claim";
  sourceId?: number;
  chainId: number;
  /** Native token amount of the source chain (will be converted to ETH via price cache) */
  amountEth: string;
  /** CoinGecko ID of the source token — if omitted, amount is treated as already in ETH */
  fromCoingeckoId?: string | null;
  settings: ReferralSettings;
}): Promise<void> {
  if (!params.settings.enabled || params.settings.maintenanceMode) return;

  // Check if commission is enabled for this source type, and get L1/L2 %
  let l1Pct: number;
  let l2Pct: number;

  if (params.sourceType === "faucet_claim") {
    // Per-chain faucet claim commission
    const chainConfig = params.settings.faucetClaimChainCommissions.find(
      c => c.chainId === params.chainId && c.enabled
    );
    if (!chainConfig) return;
    l1Pct = chainConfig.level1Pct;
    l2Pct = chainConfig.level2Pct;
  } else if (params.sourceType === "exchange") {
    if (!params.settings.commissionOnExchange) return;
    if (params.settings.exchangeChainIds.length > 0 && !params.settings.exchangeChainIds.includes(params.chainId)) return;
    l1Pct = params.settings.exchangeLevel1Pct;
    l2Pct = params.settings.exchangeLevel2Pct;
  } else {
    if (!params.settings.commissionOnBuy) return;
    if (params.settings.buyChainIds.length > 0 && !params.settings.buyChainIds.includes(params.chainId)) return;
    l1Pct = params.settings.buyLevel1Pct;
    l2Pct = params.settings.buyLevel2Pct;
  }

  // Convert native token amount → ETH equivalent using live price cache
  if (params.fromCoingeckoId) registerCoingeckoId(params.fromCoingeckoId);
  const baseAmountEth = await convertToEth(params.amountEth, params.fromCoingeckoId ?? null);
  if (parseFloat(baseAmountEth) <= 0) return;

  const referee = params.refereeAddress.toLowerCase();

  const [l1ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.refereeAddress, referee))
    .limit(1);

  if (!l1ref) return;

  await recordCommission({
    referrerAddress: l1ref.referrerAddress,
    refereeAddress: referee,
    level: 1,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    chainId: params.chainId,
    baseAmountEth,
    pct: l1Pct,
  });

  const [l2ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.refereeAddress, l1ref.referrerAddress.toLowerCase()))
    .limit(1);

  if (!l2ref) return;

  await recordCommission({
    referrerAddress: l2ref.referrerAddress,
    refereeAddress: referee,
    level: 2,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    chainId: params.chainId,
    baseAmountEth,
    pct: l2Pct,
  });
}

export function verifySignature(wallet: string, message: string, signature: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}
