import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pagesTable = pgTable("pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Page = typeof pagesTable.$inferSelect;
