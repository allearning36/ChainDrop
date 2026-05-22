import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  refereeAddress: text("referee_address").notNull().unique(),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referralCommissionsTable = pgTable("referral_commissions", {
  id: serial("id").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  refereeAddress: text("referee_address").notNull(),
  level: integer("level").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"),
  chainId: integer("chain_id").notNull(),
  amountEth: numeric("amount_eth", { precision: 18, scale: 10 }).notNull(),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  claimTxHash: text("claim_tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const referralClaimRequestsTable = pgTable("referral_claim_requests", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  amountEth: numeric("amount_eth", { precision: 18, scale: 10 }).notNull(),
  claimChainId: integer("claim_chain_id").notNull(),
  signature: text("signature").notNull(),
  nonce: text("nonce").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

export const insertReferralCommissionSchema = createInsertSchema(referralCommissionsTable).omit({ id: true, createdAt: true });
export type InsertReferralCommission = z.infer<typeof insertReferralCommissionSchema>;
export type ReferralCommission = typeof referralCommissionsTable.$inferSelect;

export const insertReferralClaimRequestSchema = createInsertSchema(referralClaimRequestsTable).omit({ id: true, createdAt: true });
export type InsertReferralClaimRequest = z.infer<typeof insertReferralClaimRequestSchema>;
export type ReferralClaimRequest = typeof referralClaimRequestsTable.$inferSelect;
