import { pgTable, text, serial, timestamp, numeric, integer, boolean, index } from "drizzle-orm/pg-core";

export const promoCodesTable = pgTable("promo_codes", {
  id:             serial("id").primaryKey(),
  code:           text("code").notNull().unique(),
  chainId:        integer("chain_id").notNull(),
  claimAmount:    numeric("claim_amount", { precision: 18, scale: 8 }).notNull(),
  maxClaims:      integer("max_claims").notNull().default(100),
  usedCount:      integer("used_count").notNull().default(0),
  isActive:       boolean("is_active").notNull().default(true),
  note:           text("note"),
  codeLink:       text("code_link"),
  successMessage: text("success_message"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:      timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("promo_codes_chain_idx").on(t.chainId),
  index("promo_codes_code_idx").on(t.code),
]);

export const promoClaimsTable = pgTable("promo_claims", {
  id:        serial("id").primaryKey(),
  promoId:   integer("promo_id").notNull(),
  address:   text("address").notNull(),
  ip:        text("ip"),
  txHash:    text("tx_hash").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("promo_claims_promo_idx").on(t.promoId),
  index("promo_claims_address_idx").on(t.address),
  index("promo_claims_ip_idx").on(t.ip),
]);

export type PromoCode = typeof promoCodesTable.$inferSelect;
export type PromoClaim = typeof promoClaimsTable.$inferSelect;
