import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const pageViewsTable = pgTable("page_views", {
  id:          serial("id").primaryKey(),
  ip:          text("ip").notNull(),
  countryCode: text("country_code"),
  country:     text("country"),
  path:        text("path").notNull().default("/"),
  userAgent:   text("user_agent"),
  deviceType:  text("device_type"),   // "mobile" | "tablet" | "desktop"
  visitedAt:   timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PageView = typeof pageViewsTable.$inferSelect;
