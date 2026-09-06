import { createHash, randomBytes } from 'node:crypto';
import type { PlanId } from './plans';

/**
 * API keys for the /api/v1 surface. Keys are shown once and stored hashed.
 * Rate limiting is per key per calendar month against the plan's quota.
 */
export interface ApiKeyRecord {
  id: string;
  organisationId: string;
  plan: PlanId;
  keyHash: string;
  /** First 8 chars for display */
  prefix: string;
  createdAt: string;
  revokedAt?: string;
  /** Optional restriction to the organisation's private knowledge base domain */
  domainScope?: string;
}

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `gv_${randomBytes(24).toString('base64url')}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 11) };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function currentMonth(d = new Date()) {
  return d.toISOString().slice(0, 7);
}
