import type { Response } from "express";

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
}

function classifyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return "RPC_TIMEOUT";
  if (m.includes("econnrefused") || m.includes("enotfound") || m.includes("network") || m.includes("connect")) return "RPC_UNREACHABLE";
  if (m.includes("insufficient funds") || m.includes("insufficient balance")) return "WALLET_EMPTY";
  if (m.includes("nonce") || m.includes("replacement")) return "NONCE_CONFLICT";
  if (m.includes("gas")) return "GAS_ESTIMATION_FAILED";
  if (m.includes("invalid private key") || m.includes("private key")) return "BAD_PRIVATE_KEY";
  if (m.includes("captcha")) return "CAPTCHA_FAILED";
  if (m.includes("rate limit") || m.includes("too many")) return "RATE_LIMITED";
  if (m.includes("blocked")) return "ADDRESS_BLOCKED";
  if (m.includes("already claimed") || m.includes("cooldown")) return "COOLDOWN_ACTIVE";
  return "UNKNOWN";
}

export function getRootCauseLabel(cause: string): string {
  const map: Record<string, string> = {
    RPC_TIMEOUT: "RPC node is too slow or overloaded",
    RPC_UNREACHABLE: "RPC node is offline or URL is wrong",
    WALLET_EMPTY: "Faucet wallet has no balance",
    NONCE_CONFLICT: "Transaction nonce conflict — try again",
    GAS_ESTIMATION_FAILED: "Gas estimation failed on-chain",
    BAD_PRIVATE_KEY: "Invalid private key configured",
    CAPTCHA_FAILED: "reCAPTCHA verification failed",
    RATE_LIMITED: "Too many requests from this IP",
    ADDRESS_BLOCKED: "Address or IP is blocked",
    COOLDOWN_ACTIVE: "Cooldown not expired yet",
    UNKNOWN: "Unknown error",
  };
  return map[cause] ?? "Unknown error";
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
  context: Omit<LiveEvent, "id" | "ts" | "type" | "error" | "rootCause">
) {
  const msg = err instanceof Error ? err.message : String(err);
  const rootCause = classifyError(msg);
  broadcast({
    type,
    error: msg.slice(0, 200),
    rootCause,
    detail: getRootCauseLabel(rootCause),
    ...context,
  });
}

setInterval(() => {
  if (clients.size > 0) broadcast({ type: "ping" });
}, 20_000);
