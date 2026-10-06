import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getPool } from './db';

export type AdminRole = 'admin' | 'support' | 'research' | 'security' | 'product_viewer';
export type AdminPermission =
  | 'view_metrics'
  | 'view_masked_users'
  | 'view_feedback'
  | 'update_feedback'
  | 'reveal_email'
  | 'reveal_ip'
  | 'reveal_raw_words';

export type AdminPrincipal = { id: string | null; email: string; role: AdminRole };

const PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: ['view_metrics', 'view_masked_users', 'view_feedback', 'update_feedback', 'reveal_email', 'reveal_ip', 'reveal_raw_words'],
  support: ['view_metrics', 'view_masked_users', 'view_feedback', 'update_feedback'],
  research: ['view_metrics', 'view_masked_users', 'view_feedback', 'reveal_raw_words'],
  security: ['view_metrics', 'view_masked_users', 'reveal_email', 'reveal_ip'],
  product_viewer: ['view_metrics', 'view_masked_users', 'view_feedback'],
};

export function hasAdminPermission(role: string, permission: AdminPermission): boolean {
  return (PERMISSIONS[role as AdminRole] ?? []).includes(permission);
}

function credentialsMatch(candidate: string | undefined, secret: string): boolean {
  if (!candidate || candidate.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(secret));
}

function requestCredential(req: NextRequest): string | undefined {
  const authorization = req.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization?.trim();
  return req.headers.get('x-admin-key')?.trim()
    || bearer
    || req.cookies.get('eva_admin_key')?.value?.trim()
    || req.cookies.get('admin_secret')?.value?.trim();
}

export async function authenticateAdmin(req: NextRequest): Promise<AdminPrincipal | null> {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_API_KEY;
  if (!secret) {
    return process.env.NODE_ENV === 'production' ? null : { id: null, email: 'dev@eva.local', role: 'admin' };
  }
  if (!credentialsMatch(requestCredential(req), secret)) return null;

  const email = process.env.ADMIN_ACTOR_EMAIL || (process.env.NODE_ENV === 'production' ? undefined : 'admin@eva.local');
  if (!email) return null;
  if ((process.env.ADMIN_DATA_MODE ?? 'mock') !== 'api') {
    return { id: null, email, role: 'admin' };
  }

  const result = await getPool().query(
    `SELECT id::text, email, role FROM admin_users WHERE email = $1 AND status = 'active' LIMIT 1`,
    [email]
  );
  const row = result.rows[0];
  if (!row || !(row.role in PERMISSIONS)) return null;
  return { id: row.id, email: row.email, role: row.role as AdminRole };
}
