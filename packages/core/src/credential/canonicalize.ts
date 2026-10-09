import { createHash } from 'node:crypto';
import type { EvaCredentialClaim } from './types.js';

/**
 * Deterministically serialize a JSON-compatible object by sorting all object keys recursively.
 * Ensures consistent cryptographic hash across different runtimes and languages.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalizeJson(item)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const pairs = sortedKeys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalizeJson(record[key]);
  });
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes sha256 hex digest of the canonicalized claims array.
 */
export function computeClaimsDigest(claims: EvaCredentialClaim[]): string {
  const canonical = canonicalizeJson(claims);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
