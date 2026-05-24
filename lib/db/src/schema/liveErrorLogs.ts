import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

export const liveErrorLogsTable = pgTable("live_error_logs", {
  id:        serial("id").primaryKey(),
  type:      text("type").notNull(),
  ts:        timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  chainId:   integer("chain_id"),
  chainName: text("chain_name"),
  address:   text("address"),
  ip:        text("ip"),
  error:     text("error"),
  rootCause: text("root_cause"),
  detail:    text("detail"),
  hint:      text("hint"),
}, t => [
  index("live_error_logs_ts_idx").on(t.ts),
  index("live_error_logs_root_cause_idx").on(t.rootCause),
]);

export type LiveErrorLog = typeof liveErrorLogsTable.$inferSelect;
