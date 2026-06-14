import { db } from "@workspace/db";
import { orderEventsTable } from "@workspace/db/schema";
import { logger } from "./logger";

export async function logOrderEvent(opts: {
  orderType: "FAUCET_BUY" | "CROSS_CHAIN_SWAP";
  orderId: string;
  event: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  txHash?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(orderEventsTable).values({
      orderType: opts.orderType,
      orderId: String(opts.orderId),
      event: opts.event,
      oldStatus: opts.oldStatus ?? null,
      newStatus: opts.newStatus ?? null,
      txHash: opts.txHash ?? null,
      error: opts.error ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write order event (non-critical)");
  }
}
