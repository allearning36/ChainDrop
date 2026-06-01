import { pgTable, text, serial, timestamp, numeric, integer, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const earnDropCampaignsTable = pgTable("earn_drop_campaigns", {
  id:                serial("id").primaryKey(),
  title:             text("title").notNull(),
  logoUrl:           text("logo_url").notNull().default(""),
  rewardAmount:      numeric("reward_amount", { precision: 18, scale: 8 }).notNull(),
  rewardToken:       text("reward_token").notNull(),
  chainId:           integer("chain_id").notNull(),
  endDate:           timestamp("end_date", { withTimezone: true }).notNull(),
  rules:             text("rules").notNull().default(""),
  twitterUrl:        text("twitter_url").notNull().default(""),
  telegramUrl:       text("telegram_url").notNull().default(""),
  discordUrl:        text("discord_url").notNull().default(""),
  websiteUrl:        text("website_url").notNull().default(""),
  promoCodeEnabled:      boolean("promo_code_enabled").notNull().default(false),
  promoScheduleEnabled:  boolean("promo_schedule_enabled").notNull().default(false),
  promoScheduleAt:       timestamp("promo_schedule_at", { withTimezone: true }),
  isActive:              boolean("is_active").notNull().default(true),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("earn_drop_campaigns_active_idx").on(t.isActive),
]);

export const earnDropTasksTable = pgTable("earn_drop_tasks", {
  id:          serial("id").primaryKey(),
  campaignId:  integer("campaign_id").notNull(),
  stepNumber:  integer("step_number").notNull(),
  title:       text("title").notNull(),
  description: text("description").notNull().default(""),
  logoUrl:     text("logo_url").notNull().default(""),
  actionType:  text("action_type").notNull().default("link"),
  actionUrl:   text("action_url").notNull().default(""),
  actionLabel: text("action_label").notNull().default("Go"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("earn_drop_tasks_campaign_idx").on(t.campaignId),
]);

export const earnDropPromoCodesTable = pgTable("earn_drop_promo_codes", {
  id:         serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  code:       text("code").notNull(),
  maxUses:    integer("max_uses").notNull().default(0),
  usedCount:  integer("used_count").notNull().default(0),
  isActive:   boolean("is_active").notNull().default(true),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("earn_drop_promo_campaign_idx").on(t.campaignId),
  index("earn_drop_promo_code_idx").on(t.code),
]);

export const earnDropParticipantsTable = pgTable("earn_drop_participants", {
  id:             serial("id").primaryKey(),
  campaignId:     integer("campaign_id").notNull(),
  address:        text("address").notNull(),
  completedSteps: jsonb("completed_steps").$type<number[]>().notNull().default([]),
  promoCode:      text("promo_code"),
  status:         text("status").notNull().default("pending"),
  txHash:         text("tx_hash"),
  claimedAt:      timestamp("claimed_at", { withTimezone: true }),
  claimedFromIp:  text("claimed_from_ip"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("earn_drop_participants_campaign_idx").on(t.campaignId),
  index("earn_drop_participants_address_idx").on(t.address),
]);

// Anonymous join tracking — session-ID based (no address needed)
export const earnDropJoinsTable = pgTable("earn_drop_joins", {
  id:         serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  sessionId:  text("session_id").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("earn_drop_joins_campaign_idx").on(t.campaignId),
  uniqueIndex("earn_drop_joins_unique_idx").on(t.campaignId, t.sessionId),
]);

export type EarnDropCampaign      = typeof earnDropCampaignsTable.$inferSelect;
export type EarnDropTask          = typeof earnDropTasksTable.$inferSelect;
export type EarnDropPromoCode     = typeof earnDropPromoCodesTable.$inferSelect;
export type EarnDropParticipant   = typeof earnDropParticipantsTable.$inferSelect;
export type EarnDropJoin          = typeof earnDropJoinsTable.$inferSelect;
