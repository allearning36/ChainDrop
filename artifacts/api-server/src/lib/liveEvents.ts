import type { Response } from "express";
import { db, liveErrorLogsTable } from "@workspace/db";

export type LiveEventType =
  | "claim_success"
  | "claim_error"
  | "rpc_error"
  | "server_error"
  | "ping";

export interface LiveEvent {
  id: string;
  type: LiveEventType;
  ts: string;
  chainName?: string;
  chainId?: number;
  address?: string;
  txHash?: string;
  amount?: string;
  symbol?: string;
  ip?: string;
  error?: string;
  rootCause?: string;
  detail?: string;
  hint?: string;
}

function classifyError(err: unknown): string {
  const code = (err as Record<string, unknown>)?.code;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Also extract inner RPC error message from ethers "could not coalesce" wrapper:
  // e.g. could not coalesce error (error={ "code": -32000, "message": "intrinsic gas too low" }, ...)
  const innerRpcCode = (() => {
    const e = (err as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    if (e?.code != null) return Number(e.code);
    const m = msg.match(/"code"\s*:\s*(-?\d+)/);
    return m ? Number(m[1]) : null;
  })();
  const innerRpcMsg = (() => {
    const e = (err as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    if (typeof e?.message === "string") return e.message.toLowerCase();
    const m = msg.match(/"message"\s*:\s*"([^"]+)"/);
    return m ? m[1].toLowerCase() : "";
  })();

  // Ethers.js v6 native error codes (most reliable signal)
  if (code === "WALLET_GAS_LOW") return "WALLET_GAS_LOW";
  if (code === "INSUFFICIENT_FUNDS") return "WALLET_EMPTY";
  if (code === "NONCE_EXPIRED" || code === "NONCE_TOO_LOW") return "NONCE_CONFLICT";
  if (code === "REPLACEMENT_UNDERPRICED") return "TX_UNDERPRICED";
  if (code === "CALL_EXCEPTION") return "TX_REVERTED";
  if (code === "UNPREDICTABLE_GAS_LIMIT") return "GAS_ESTIMATION_FAILED";
  if (code === "NETWORK_ERROR") return "RPC_UNREACHABLE";
  if (code === "SERVER_ERROR") return "RPC_BAD_RESPONSE";
  if (code === "TIMEOUT") return "RPC_TIMEOUT";
  if (code === "BAD_DATA") return "RPC_BAD_RESPONSE";
  if (code === "INVALID_ARGUMENT") return "INVALID_ADDRESS";
  if (code === "TRANSACTION_REPLACED") return "TX_REPLACED";

  // Inner RPC error codes (e.g. from "could not coalesce" wrapper)
  // -32000 covers gas errors, insufficient funds etc — resolve via inner message
  if (innerRpcCode === -32000 || innerRpcMsg) {
    if (innerRpcMsg.includes("intrinsic gas") || innerRpcMsg.includes("gas too low")) return "GAS_ESTIMATION_FAILED";
    if (innerRpcMsg.includes("insufficient funds") || innerRpcMsg.includes("insufficient balance")) return "WALLET_EMPTY";
    if (innerRpcMsg.includes("nonce too low") || innerRpcMsg.includes("nonce too high")) return "NONCE_CONFLICT";
    if (innerRpcMsg.includes("underpriced") || innerRpcMsg.includes("fee too low")) return "TX_UNDERPRICED";
    if (innerRpcMsg.includes("execution reverted") || innerRpcMsg.includes("revert")) return "TX_REVERTED";
    if (innerRpcMsg.includes("out of gas") || innerRpcMsg.includes("gas limit")) return "GAS_ESTIMATION_FAILED";
    if (innerRpcMsg.includes("already known") || innerRpcMsg.includes("already imported")) return "TX_DUPLICATE";
  }

  // SSL / TLS errors (e.g. wss:// handshake failure)
  if (
    msg.includes("eproto") ||
    msg.includes("ssl alert") ||
    msg.includes("tls alert") ||
    msg.includes("handshake failure") ||
    msg.includes("ssl routines") ||
    msg.includes("ssl3_read_bytes") ||
    (msg.includes("ssl") && msg.includes("error"))
  ) return "SSL_TLS_ERROR";

  // Node.js / HTTP network errors
  if (msg.includes("econnreset") || msg.includes("socket hang up")) return "RPC_DISCONNECTED";
  if (msg.includes("econnrefused")) return "RPC_REFUSED";
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) return "RPC_INVALID_URL";
  if (msg.includes("etimedout") || msg.includes("timed out") || msg.includes("timeout")) return "RPC_TIMEOUT";
  if (msg.includes("could not detect network") || msg.includes("network changed")) return "RPC_WRONG_NETWORK";

  // Gas / transaction errors — check BEFORE generic RPC wrapper patterns
  if (msg.includes("intrinsic gas") || msg.includes("gas too low")) return "GAS_ESTIMATION_FAILED";
  if (msg.includes("out of gas") || msg.includes("gas limit exceeded")) return "GAS_ESTIMATION_FAILED";
  if (msg.includes("max fee per gas less than block") || msg.includes("base fee")) return "GAS_TOO_LOW";
  if (msg.includes("insufficient funds") || msg.includes("insufficient balance") || msg.includes("not enough balance")) return "WALLET_EMPTY";
  if (msg.includes("nonce too low") || msg.includes("nonce too high") || msg.includes("replacement") || msg.includes("nonce")) return "NONCE_CONFLICT";
  if (msg.includes("underpriced")) return "TX_UNDERPRICED";
  if (msg.includes("execution reverted") || msg.includes("revert")) return "TX_REVERTED";
  if (msg.includes("transaction already known") || msg.includes("already imported")) return "TX_DUPLICATE";

  // RPC response errors (checked last so gas errors inside wrapper messages don't fall here)
  if (msg.includes("invalid json") || msg.includes("bad response") || msg.includes("unexpected token") || msg.includes("could not coalesce")) return "RPC_BAD_RESPONSE";

  // Config errors
  if (msg.includes("invalid private key") || msg.includes("bad private key") || msg.includes("private key")) return "BAD_PRIVATE_KEY";
  if (msg.includes("invalid address") || msg.includes("bad address")) return "INVALID_ADDRESS";

  // App-level
  if (msg.includes("captcha")) return "CAPTCHA_FAILED";
  if (msg.includes("rate limit") || msg.includes("too many")) return "RATE_LIMITED";
  if (msg.includes("blocked")) return "ADDRESS_BLOCKED";
  if (msg.includes("already claimed") || msg.includes("cooldown")) return "COOLDOWN_ACTIVE";

  return "UNKNOWN";
}

interface ErrorMeta { detail: string; hint: string }

function getErrorMeta(cause: string): ErrorMeta {
  const map: Record<string, ErrorMeta> = {
    SSL_TLS_ERROR:           { detail: "RPC-এর সাথে SSL/TLS handshake ব্যর্থ হয়েছে — wss:// endpoint টি সঠিক certificate দিচ্ছে না বা version mismatch", hint: "এই chain-এ wss:// এর বদলে https:// RPC URL ব্যবহার করুন, অথবা ভিন্ন RPC endpoint নির্বাচন করুন" },
    RPC_DISCONNECTED:        { detail: "RPC সংযোগ মাঝপথে বিচ্ছিন্ন হয়েছে (socket hang up / ECONNRESET)",          hint: "Admin → Chain Management থেকে RPC URL পরিবর্তন করুন বা পরে আবার চেষ্টা করুন" },
    RPC_REFUSED:             { detail: "RPC সার্ভার সংযোগ প্রত্যাখ্যান করেছে (ECONNREFUSED) — সম্ভবত port বা host ভুল", hint: "Admin → Chain Management থেকে RPC URL যাচাই করুন" },
    RPC_INVALID_URL:         { detail: "RPC URL-এর domain খোঁজা যাচ্ছে না (ENOTFOUND) — URL ভুল বা typo আছে",        hint: "Admin → Chain Management থেকে RPC URL ঠিক করুন" },
    RPC_TIMEOUT:             { detail: "RPC node সময়মতো সাড়া দেয়নি (timeout)",                                       hint: "RPC node ধীর বা overloaded — ভিন্ন RPC endpoint ব্যবহার করুন" },
    RPC_UNREACHABLE:         { detail: "RPC নেটওয়ার্কে পৌঁছানো যাচ্ছে না",                                           hint: "Admin → Chain Management থেকে RPC URL পরিবর্তন করুন" },
    RPC_WRONG_NETWORK:       { detail: "RPC নেটওয়ার্ক detect করা যাচ্ছে না — সম্ভবত ভুল chain-এর RPC",              hint: "নিশ্চিত করুন RPC URL সঠিক chain-এর জন্য" },
    RPC_BAD_RESPONSE:        { detail: "RPC সার্ভার invalid বা malformed response পাঠিয়েছে",                          hint: "RPC node-টি ঠিকমতো কাজ করছে না — ভিন্ন endpoint ব্যবহার করুন" },
    WALLET_EMPTY:            { detail: "Faucet wallet-এ পর্যাপ্ত balance নেই",                                        hint: "Admin → Wallet Health থেকে balance দেখুন এবং faucet wallet-এ টাকা পাঠান" },
    WALLET_GAS_LOW:          { detail: "Faucet wallet-এ token আছে কিন্তু gas fee দেওয়ার জন্য যথেষ্ট নয়",             hint: "Admin → Chain Management → এই chain-এর Gas Price Override কমিয়ে দিন, অথবা faucet wallet-এ আরো token পাঠান" },
    NONCE_CONFLICT:          { detail: "Transaction nonce conflict — আগের transaction pending বা nonce mismatch",     hint: "কিছুক্ষণ অপেক্ষা করুন; pending transaction clear হলে আবার হবে" },
    TX_UNDERPRICED:          { detail: "Transaction gas price খুব কম — নেটওয়ার্ক accept করেনি",                     hint: "সার্ভার restart করুন অথবা gas multiplier বাড়ান" },
    TX_REVERTED:             { detail: "Transaction on-chain revert হয়েছে — smart contract বা নেটওয়ার্ক সমস্যা",    hint: "Chain-এর explorer-এ tx hash দেখুন কারণ জানতে" },
    TX_DUPLICATE:            { detail: "Transaction আগেই submit হয়েছে (duplicate tx)",                               hint: "আগের transaction confirm হওয়ার পর আবার চেষ্টা করুন" },
    TX_REPLACED:             { detail: "Transaction replace হয়ে গেছে (speed-up বা cancel)",                          hint: "সাধারণত নিজে থেকেই ঠিক হয়" },
    GAS_ESTIMATION_FAILED:   { detail: "Gas limit অথবা gas fee সমস্যা (intrinsic gas too low / out of gas)",         hint: "সাধারণত transaction retry করলে ঠিক হয়। বারবার হলে chain-এর RPC URL ও wallet balance যাচাই করুন" },
    GAS_TOO_LOW:             { detail: "Gas fee নেটওয়ার্কের block base fee-র চেয়ে কম",                              hint: "নেটওয়ার্ক congested — কিছুক্ষণ পর আবার চেষ্টা করুন" },
    BAD_PRIVATE_KEY:         { detail: "Faucet wallet-এর private key invalid বা format ভুল",                         hint: "Admin → Chain Management থেকে private key পুনরায় সেট করুন" },
    INVALID_ADDRESS:         { detail: "Wallet address format সঠিক নয়",                                              hint: "ব্যবহারকারীর address যাচাই করুন" },
    CAPTCHA_FAILED:          { detail: "reCAPTCHA verification ব্যর্থ হয়েছে",                                        hint: "ব্যবহারকারীকে আবার CAPTCHA complete করতে বলুন" },
    RATE_LIMITED:            { detail: "এই IP থেকে অনেক বেশি request এসেছে",                                        hint: "IP blocking বা rate limit বাড়ানোর কথা বিবেচনা করুন" },
    ADDRESS_BLOCKED:         { detail: "Address বা IP block করা আছে",                                                hint: "Admin → Blocked Addresses দেখুন" },
    COOLDOWN_ACTIVE:         { detail: "Cooldown এখনো শেষ হয়নি",                                                    hint: "ব্যবহারকারীকে পরে আসতে বলুন" },
    UNKNOWN:                 { detail: "অজানা error — server log দেখুন বিস্তারিত জানতে",                             hint: "API server console log চেক করুন" },
  };
  return map[cause] ?? { detail: "Unknown error", hint: "Server log দেখুন" };
}

let _counter = 0;
function nextId() { return `ev_${Date.now()}_${++_counter}`; }

const clients = new Set<Response>();

export function addClient(res: Response) { clients.add(res); }
export function removeClient(res: Response) { clients.delete(res); }
export function clientCount() { return clients.size; }

function send(res: Response, event: LiveEvent) {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch { /* client disconnected */ }
}

export function broadcast(event: Omit<LiveEvent, "id" | "ts">) {
  const full: LiveEvent = { id: nextId(), ts: new Date().toISOString(), ...event };
  for (const res of clients) send(res, full);
}

export function broadcastError(
  type: LiveEventType,
  err: unknown,
  context: Omit<LiveEvent, "id" | "ts" | "type" | "error" | "rootCause" | "detail" | "hint">
) {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const rootCause = classifyError(err);
  const { detail, hint } = getErrorMeta(rootCause);
  broadcast({
    type,
    error: rawMsg.slice(0, 300),
    rootCause,
    detail,
    hint,
    ...context,
  });

  // Persist error to DB so admin can review it days later
  db.insert(liveErrorLogsTable).values({
    type,
    chainId:   context.chainId   ?? null,
    chainName: context.chainName ?? null,
    address:   context.address   ?? null,
    ip:        context.ip        ?? null,
    error:     rawMsg.slice(0, 500),
    rootCause,
    detail,
    hint,
  }).catch(() => { /* never block broadcast on DB failure */ });
}

export { classifyError, getErrorMeta };

setInterval(() => {
  if (clients.size > 0) broadcast({ type: "ping" });
}, 20_000);
