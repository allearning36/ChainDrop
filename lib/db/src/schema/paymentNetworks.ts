import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const paymentNetworksTable = pgTable("payment_networks", {
  id: serial("id").primaryKey(),
  networkId: text("network_id").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().default("ETH"),
  chainId: integer("chain_id").notNull(),
  rpcUrl: text("rpc_url").notNull(),
  contractAddress: text("contract_address"),
  tokenDecimals: integer("token_decimals").notNull().default(18),
  logoUrl: text("logo_url"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentNetworkRow = typeof paymentNetworksTable.$inferSelect;
