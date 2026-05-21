import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const adTokensTable = pgTable("ad_tokens", {
  id: serial("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  address: text("address").notNull(),
  token: text("token").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  validAfter: timestamp("valid_after", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
