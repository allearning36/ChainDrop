import { pgTable, text, serial, timestamp, numeric, integer, boolean, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claimsTable = pgTable("claims", {
  id:          serial("id").primaryKey(),
  chainId:     integer("chain_id").notNull(),
  address:     text("address").notNull(),
  txHash:      text("tx_hash").notNull(),
  amount:      numeric("amount", { precision: 18, scale: 8 }).notNull(),
  claimedAt:   timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  // Anti-abuse tracking fields
  ip:            text("ip"),
  fingerprint:   text("fingerprint"),
  userAgent:     text("user_agent"),
  country:       text("country"),
  timezone:      text("timezone"),
  vpnDetected:   boolean("vpn_detected").default(false),
  trustScore:    real("trust_score").default(50),
  sigVerified:   boolean("sig_verified").default(false),
}, t => [
  index("claims_address_chain_idx").on(t.address, t.chainId),
  index("claims_ip_idx").on(t.ip),
  index("claims_fingerprint_idx").on(t.fingerprint),
  index("claims_claimed_at_idx").on(t.claimedAt),
]);

export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true, claimedAt: true });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claimsTable.$inferSelect;
