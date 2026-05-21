import crypto from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1";

function getDerivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "chaindrop-insecure-default-please-set-session-secret";
  return crypto.scryptSync(secret, "chaindrop-pk-v1-salt", 32) as Buffer;
}

/**
 * Encrypt a private key before storing in the database.
 * Returns a string prefixed with "enc:v1:" so we can detect encrypted values.
 */
export function encryptPrivateKey(plain: string): string {
  if (!plain) return plain;
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  return `${PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a private key read from the database.
 * Backward-compatible: if not prefixed with "enc:v1:", returns the value as-is
 * (supports plain-text keys already in the database).
 */
export function decryptPrivateKey(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith(`${PREFIX}:`)) return stored;
  try {
    const parts = stored.split(":");
    const ivHex = parts[2];
    const tagHex = parts[3];
    const ctHex = parts[4];
    if (!ivHex || !tagHex || !ctHex) return stored;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    (decipher as any).setAuthTag(tag);
    return decipher.update(ct).toString("utf8") + decipher.final("utf8");
  } catch {
    return stored;
  }
}
