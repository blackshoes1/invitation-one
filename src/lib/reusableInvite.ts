import { createHash, createHmac } from "node:crypto";
import { signingKeyFromEnv } from "./signedToken";

/** Server only. Domain-separated 128-bit invite, compatible with existing hash lookup.
 * Canonicalize Postgres timestamps before deriving; never use public key material.
 * Existing random tokens cannot be reconstructed and must never be silently rotated.
 */
export function reusableInviteToken(
  memberId: string, invitedAt: string, key: Buffer | null = signingKeyFromEnv(),
): string | null {
  const time = Date.parse(invitedAt);
  if (!key || !memberId || !Number.isFinite(time)) return null;
  return createHmac("sha256", key)
    .update(JSON.stringify(["group-member-invite:v1", memberId, new Date(time).toISOString()]))
    .digest("hex").slice(0, 32);
}

export function inviteTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function recoverInviteToken(member: {
  id: string; invited_at: string | null; invite_token_hash: string | null;
}, key: Buffer | null = signingKeyFromEnv()): string | null {
  if (!member.invited_at || !member.invite_token_hash) return null;
  const token = reusableInviteToken(member.id, member.invited_at, key);
  return token && inviteTokenHash(token) === member.invite_token_hash ? token : null;
}
