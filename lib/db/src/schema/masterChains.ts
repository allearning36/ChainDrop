import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const masterChainsTable = pgTable("master_chains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  chainId: integer("chain_id"),
  chainType: text("chain_type").notNull().default("evm"),
  logoUrl: text("logo_url"),
  rpcUrls: text("rpc_urls").notNull().default('[]'),
  explorerUrls: text("explorer_urls").notNull().default('[]'),
  isTestnet: boolean("is_testnet").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MasterChain = typeof masterChainsTable.$inferSelect;
