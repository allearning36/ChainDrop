import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chainsTable } from "./chains";

export const chainAdsTable = pgTable("chain_ads", {
  id: serial("id").primaryKey(),
  chainId: integer("chain_id").notNull().references(() => chainsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default(""),
  adUrl: text("ad_url").notNull(),
  adType: text("ad_type").notNull().default("vast"),
  priority: integer("priority").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChainAdSchema = createInsertSchema(chainAdsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChainAd = z.infer<typeof insertChainAdSchema>;
export type ChainAd = typeof chainAdsTable.$inferSelect;
