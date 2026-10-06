// packages/runtime-sentinel/src/http.ts
// Tiny HTTP helper shared by built-in probes and user probes.
// No third-party deps — uses global fetch (Node 18+ / Bun / Deno).

import type { SentinelContext } from './types.js';

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T | null;
  error?: string;
  rawSetCookie?: string | null;
  duration_ms: number;
}

export interface HttpOptions extends RequestInit {
  /** Inject a session cookie eva_session=<token> automatically */
  token?: string;
  /** Cookie name when token is provided. Default: eva_session */
  cookieName?: string;
  /** Override base url for this request */
  base?: string;
}

export async function httpJson<T = unknown>(
  ctx: SentinelContext,
  path: string,
  opts: HttpOptions = {},
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.token) {
    const name = opts.cookieName ?? 'eva_session';
    headers['Cookie'] = `${name}=${opts.token}`;
  }

  const base = opts.base ?? ctx.base;
  const start = Date.now();
  try {
    const r = await fetch(`${base}${path}`, { ...opts, headers });
    const duration_ms = Date.now() - start;
    const text = await r.text();
    let body: T | null = null;
    if (text) {
      try { body = JSON.parse(text) as T; } catch { /* leave null */ }
    }
    return {
      ok: r.ok,
      status: r.status,
      body,
      error: r.ok ? undefined : `HTTP ${r.status}: ${text.slice(0, 200)}`,
      rawSetCookie: r.headers.get('set-cookie'),
      duration_ms,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: (err as Error).message,
      duration_ms: Date.now() - start,
    };
  }
}

/** Pull `<cookieName>=<value>` out of a Set-Cookie header. */
export function extractCookieValue(
  rawSetCookie: string | null | undefined,
  cookieName = 'eva_session',
): string | null {
  if (!rawSetCookie) return null;
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|;\\s*|,\\s*)${escaped}=([^;,\\s]+)`);
  const m = rawSetCookie.match(re);
  return m?.[1] ?? null;
}
