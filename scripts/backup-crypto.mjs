import crypto from "node:crypto";

export function backupKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("BACKUP_ENCRYPTION_KEY: a separate 32-byte base64 key is required");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Invalid backup key");
  return key;
}
export function encryptBackup(rows, table, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`invitation-backup:v1:${table}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(rows), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, table, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function decryptBackup(text, table, key) {
  const value = JSON.parse(text);
  if (value.version !== 1 || value.table !== table) throw new Error("Invalid backup format or table");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(`invitation-backup:v1:${table}`));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const rows = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8"));
  if (!Array.isArray(rows)) throw new Error("Invalid backup data");
  return rows;
}
