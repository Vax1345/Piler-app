import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.PROFILE_ENCRYPTION_KEY || process.env.DATABASE_URL;
  if (!key) {
    console.warn("[profileCrypto] No PROFILE_ENCRYPTION_KEY set, using DATABASE_URL for key derivation");
  }
  return crypto.createHash("sha256").update(key || "").digest();
}

export function encryptProfile(data: Record<string, any>): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv) as crypto.CipherGCM;
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

export function decryptProfile(encrypted: string): Record<string, any> {
  try {
    if (!encrypted) return {};
    if (typeof encrypted === "object") return encrypted;

    const parts = encrypted.split(":");
    if (parts.length === 3) {
      const [ivHex, authTagHex, encryptedData] = parts;
      if (ivHex.length === 24 && authTagHex.length === 32 && encryptedData) {
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv) as crypto.DecipherGCM;
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedData, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
      }
    }

    return JSON.parse(encrypted);
  } catch {
    try {
      return typeof encrypted === "object" ? encrypted : JSON.parse(encrypted as string);
    } catch {
      return {};
    }
  }
}
