import { pgTable, text, serial, timestamp, integer, boolean, real, jsonb, index } from "drizzle-orm/pg-core";

export const abuseLogsTable = pgTable("abuse_logs", {
  id:          serial("id").primaryKey(),
  address:     text("address").notNull(),
  ip:          text("ip").notNull(),
  fingerprint: text("fingerprint"),
  userAgent:   text("user_agent"),
  timezone:    text("timezone"),
  country:     text("country"),
  isp:         text("isp"),
  vpnDetected: boolean("vpn_detected").default(false),
  proxyDetected: boolean("proxy_detected").default(false),
  torDetected: boolean("tor_detected").default(false),
  datacenterDetected: boolean("datacenter_detected").default(false),
  trustScore:  real("trust_score").default(50),
  flags:       jsonb("flags").$type<string[]>().default([]),
  action:      text("action").notNull().default("allowed"),
  chainId:     integer("chain_id"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("abuse_logs_ip_idx").on(t.ip),
  index("abuse_logs_fingerprint_idx").on(t.fingerprint),
  index("abuse_logs_address_idx").on(t.address),
  index("abuse_logs_created_at_idx").on(t.createdAt),
]);

export const autoBansTable = pgTable("auto_bans", {
  id:          serial("id").primaryKey(),
  targetType:  text("target_type").notNull(),  // "ip" | "fingerprint" | "address"
  targetValue: text("target_value").notNull(),
  reason:      text("reason").notNull(),
  trustScore:  real("trust_score"),
  banCount:    integer("ban_count").default(1),
  expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("auto_bans_target_idx").on(t.targetType, t.targetValue),
  index("auto_bans_expires_idx").on(t.expiresAt),
]);

export const ipRepCacheTable = pgTable("ip_rep_cache", {
  ip:                 text("ip").primaryKey(),
  country:            text("country"),
  countryCode:        text("country_code"),
  isp:                text("isp"),
  org:                text("org"),
  vpnDetected:        boolean("vpn_detected").default(false),
  proxyDetected:      boolean("proxy_detected").default(false),
  torDetected:        boolean("tor_detected").default(false),
  datacenterDetected: boolean("datacenter_detected").default(false),
  reputationScore:    real("reputation_score").default(100),
  checkedAt:          timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nonceTable = pgTable("nonces", {
  id:        serial("id").primaryKey(),
  address:   text("address").notNull(),
  nonce:     text("nonce").notNull(),
  usedAt:    timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("nonces_address_idx").on(t.address),
]);

export type AbuseLogs = typeof abuseLogsTable.$inferSelect;
export type AutoBan   = typeof autoBansTable.$inferSelect;
export type IpRepCache = typeof ipRepCacheTable.$inferSelect;
