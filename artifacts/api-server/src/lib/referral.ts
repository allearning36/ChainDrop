import { ethers } from "ethers";
import { db } from "@workspace/db";
import { referralsTable, referralCommissionsTable, settingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export interface ReferralSettings {
  enabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  level1Pct: number;
  level2Pct: number;
  commissionOnExchange: boolean;
  commissionOnBuy: boolean;
  commissionOnFaucetClaim: boolean;
  exchangeChainIds: number[];
  buyChainIds: number[];
  faucetClaimChainIds: number[];
  claimChainIds: number[];
  minClaimEth: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: true,
  maintenanceMode: false,
  maintenanceMessage: "Referral System Coming Soon...",
  level1Pct: 1,
  level2Pct: 0.5,
  commissionOnExchange: true,
  commissionOnBuy: true,
  commissionOnFaucetClaim: false,
  exchangeChainIds: [],
  buyChainIds: [],
  faucetClaimChainIds: [],
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
  amountEth: string;
  settings: ReferralSettings;
}): Promise<void> {
  if (!params.settings.enabled || params.settings.maintenanceMode) return;

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
    baseAmountEth: params.amountEth,
    pct: params.settings.level1Pct,
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
    baseAmountEth: params.amountEth,
    pct: params.settings.level2Pct,
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
