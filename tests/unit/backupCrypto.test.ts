import { expect, it } from "vitest";
// Local node script, tested without connecting to a database.
import { backupKey, encryptBackup, decryptBackup } from "../../scripts/backup-crypto.mjs";
const key = backupKey(Buffer.alloc(32, 7).toString("base64"));
const rows = [{ name: "Private Person", phone: "01011112222" }];
it("encrypts and authenticates backups using a fresh nonce", () => {
  const first = encryptBackup(rows, "participants", key), second = encryptBackup(rows, "participants", key);
  expect(first).not.toContain("Private Person"); expect(first).not.toContain("01011112222"); expect(first).not.toBe(second);
  expect(decryptBackup(first, "participants", key)).toEqual(rows);
});
it("rejects wrong keys, swapped tables and modified ciphertext", () => {
  const text = encryptBackup(rows, "participants", key);
  expect(() => decryptBackup(text, "participants", Buffer.alloc(32, 8))).toThrow();
  expect(() => decryptBackup(text, "deliveries", key)).toThrow();
  const value = JSON.parse(text); value.data = Buffer.alloc(25).toString("base64");
  expect(() => decryptBackup(JSON.stringify(value), "participants", key)).toThrow();
  expect(() => backupKey("short")).toThrow();
});
