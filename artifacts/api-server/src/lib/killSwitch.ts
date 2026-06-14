import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function isKilled(key: string): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value === "1";
}

export async function checkBuyKilled(): Promise<string | null> {
  if (await isKilled("kill:buy")) return "Faucet Buy is temporarily disabled for maintenance.";
  return null;
}

export async function checkExchangeKilled(): Promise<string | null> {
  if (await isKilled("kill:exchange")) return "Exchange is temporarily disabled for maintenance.";
  return null;
}

export async function checkChainKilled(chainId: number): Promise<string | null> {
  if (await isKilled(`kill:chain:${chainId}`)) return "This chain is temporarily unavailable.";
  return null;
}

export async function getAllKillSwitches(): Promise<{
  buy: boolean;
  exchange: boolean;
  chains: Record<string, boolean>;
}> {
  const rows = await db.select().from(settingsTable);
  const result: { buy: boolean; exchange: boolean; chains: Record<string, boolean> } = {
    buy: false,
    exchange: false,
    chains: {},
  };
  for (const row of rows) {
    if (row.key === "kill:buy") result.buy = row.value === "1";
    else if (row.key === "kill:exchange") result.exchange = row.value === "1";
    else if (row.key.startsWith("kill:chain:")) {
      const chainId = row.key.replace("kill:chain:", "");
      result.chains[chainId] = row.value === "1";
    }
  }
  return result;
}

export async function setKillSwitch(key: string, value: boolean): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value: value ? "1" : "0" })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: value ? "1" : "0" } });
}
