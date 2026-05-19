import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  userAddress: text("user_address").notNull(),
  mainnetTxHash: text("mainnet_tx_hash").notNull().unique(),
  mainnetAmountPaid: numeric("mainnet_amount_paid", { precision: 18, scale: 8 }).notNull(),
  testnetAmountSent: numeric("testnet_amount_sent", { precision: 18, scale: 8 }),
  testnetTxHash: text("testnet_tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
