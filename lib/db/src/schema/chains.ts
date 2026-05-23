import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chainsTable = pgTable("chains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  chainId: integer("chain_id"),
  logoUrl: text("logo_url"),
  rpcUrl: text("rpc_url").notNull(),
  rpcUrls: text("rpc_urls").notNull().default('[]'),
  privateKey: text("private_key"),
  walletAddress: text("wallet_address"),
  claimAmount: numeric("claim_amount", { precision: 18, scale: 8 }).notNull().default("0.05"),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(86400),
  isTestnet: boolean("is_testnet").notNull().default(true),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false),
  availableStatus: text("available_status").notNull().default("YES"),
  buyEnabled: boolean("buy_enabled").notNull().default(false),
  buyUrl: text("buy_url"),
  buyRate: numeric("buy_rate", { precision: 18, scale: 4 }).notNull().default("1000"),
  buyMinAmount: numeric("buy_min_amount", { precision: 18, scale: 8 }).notNull().default("0.0005"),
  buyMaxAmount: numeric("buy_max_amount", { precision: 18, scale: 8 }),
  buyCurrencies: text("buy_currencies").notNull().default('["eth"]'),
  receiveAddress: text("receive_address"),
  tokenPrice: numeric("token_price", { precision: 18, scale: 8 }),
  explorerUrl: text("explorer_url"),
  coingeckoId: text("coingecko_id"),
  chainType: text("chain_type").notNull().default("evm"),
  soonMessage: text("soon_message"),
  gasPriceGwei: numeric("gas_price_gwei", { precision: 18, scale: 4 }),
  gasLimit: integer("gas_limit"),
  adClaimEnabled: boolean("ad_claim_enabled").notNull().default(false),
  adClaimAmount: numeric("ad_claim_amount", { precision: 18, scale: 8 }),
  adDurationSeconds: integer("ad_duration_seconds").notNull().default(30),
  adCooldownSeconds: integer("ad_cooldown_seconds").notNull().default(0),
  adNetworkCode: text("ad_network_code"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChainSchema = createInsertSchema(chainsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChain = z.infer<typeof insertChainSchema>;
export type Chain = typeof chainsTable.$inferSelect;
