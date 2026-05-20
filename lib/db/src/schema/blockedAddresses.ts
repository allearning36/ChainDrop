import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const blockedAddressesTable = pgTable("blocked_addresses", {
  address: text("address").primaryKey(),
  reason: text("reason").notNull().default(""),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BlockedAddress = typeof blockedAddressesTable.$inferSelect;
