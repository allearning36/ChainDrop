import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const masterChainTokensTable = pgTable("master_chain_tokens", {
  id: serial("id").primaryKey(),
  masterChainId: integer("master_chain_id").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  contractAddress: text("contract_address").notNull(),
  decimals: integer("decimals").notNull().default(18),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MasterChainToken = typeof masterChainTokensTable.$inferSelect;
