import pg from "pg";
import fs from "fs";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_hYDoQcTt54Wq@ep-old-cherry-aqyxzf91-pooler.c-8.us-east-1.aws.neon.tech/neondb",
  ssl: { rejectUnauthorized: false },
});

const TABLES = [
  "master_chains", "master_chain_tokens",
  "chains", "exchange_pairs",
  "settings", "pages", "banners", "announcements",
  "payment_networks", "ad_tokens",
  "blocked_addresses", "ip_blocks", "auto_bans",
  "claims", "purchases", "exchange_orders",
  "referrals", "referral_commissions", "referral_claim_requests",
  "referral_balance_adjustments",
  "support_conversations", "support_messages",
];

function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  let sql = "-- Neon export\nSET session_replication_role = replica;\n\n";
  let total = 0;

  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      if (!rows.length) {
        sql += `-- ${table}: 0 rows\n`;
        continue;
      }
      const cols = Object.keys(rows[0]);
      sql += `-- ${table}: ${rows.length} rows\n`;
      sql += `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;\n`;
      for (const row of rows) {
        const vals = cols.map((c) => sqlVal(row[c])).join(", ");
        sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals});\n`;
      }
      sql += "\n";
      total += rows.length;
      console.log(`✅ ${table}: ${rows.length} rows`);
    } catch (e) {
      console.log(`⚠️  ${table}: ${e.message}`);
      sql += `-- SKIPPED ${table}: ${e.message}\n\n`;
    }
  }

  sql += "SET session_replication_role = DEFAULT;\n";
  fs.writeFileSync("/tmp/neon_data.sql", sql);
  console.log(`\nTotal: ${total} rows | SQL: ${sql.length} bytes`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
