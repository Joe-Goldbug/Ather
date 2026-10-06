'use client';

import { useCallback, useEffect, useState } from 'react';
import { authApi, type AuthUser } from '@/lib/api';

// 模块级单例：避免同一浏览器 tab 内多个组件 mount 时并发打 /auth/me
let inFlight: Promise<AuthUser | null> | null = null;
let inFlightController: AbortController | null = null;
let cached: { user: AuthUser; at: number } | null = null;
const STALE_MS = 30_000;

async function fetchSession(options: { force?: boolean; signal?: AbortSignal } = {}): Promise<AuthUser | null> {
  // [fix 2026-07-01] Do NOT cache the null/anonymous state: caching "no user"
  // for 30s after a 401 caused the page mount me() probe to suppress the
  // legitimate session read right after /auth/dev-login set the cookie, leaving
  // the login button stuck on "登录中…" with no redirect. Only cache successful
  // authenticated sessions.
  if (!options.force && cached && Date.now() - cached.at < STALE_MS) {
    return cached.user;
  }
  if (inFlight && !options.force) return inFlight;
  if (inFlight && options.force) inFlightController?.abort();

  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  let request!: Promise<AuthUser | null>;
  request = (async () => {
    try {
      const me = await authApi.me(signal);
      // [fix 2026-07-26] Backend synthesizes a `dev-mock-<hex>` user from any
      // cookie whose token starts with `devmock_` (no DB row). These tokens
      // persist from earlier sessions when DB was unreachable. Caching them
      // tricks any caller (dynamic-script, profile, etc.) into thinking the
      // user is authenticated, but routes that require a real UUID (e.g.
      // dynamic-script.service UUID guard) crash with 401. Treat dev-mock
      // users as anonymous so the page's /auth/dev-login flow can overwrite
      // the stale cookie.
      if (me && typeof me.id === 'string' && me.id.startsWith('dev-mock-')) {
        if (inFlight === request) cached = null;
        return null;
      }
      if (inFlight === request) cached = me ? { user: me, at: Date.now() } : null;
      return me;
    } catch {
      if (inFlight === request) cached = null;
      return null;
    }
  })();
  inFlight = request;
  inFlightController = controller;
  try {
    return await request;
  } finally {
    if (inFlight === request) {
      inFlight = null;
      inFlightController = null;
    }
  }
}

export function useSession() {
  const [user, setUser] = useState<AuthUser | null>(() => cached?.user ?? null);
  const [loading, setLoading] = useState<boolean>(() => !cached);

  const refresh = useCallback(async (options: { force?: boolean; signal?: AbortSignal } = {}) => {
    setLoading(true);
    try {
      const me = await fetchSession(options);
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best effort
    } finally {
      cached = null;
      setUser(null);
    }
  }, []);

  return {
    user,
    loading,
    isAuthed: Boolean(user),
    refresh,
    logout,
  };
}
