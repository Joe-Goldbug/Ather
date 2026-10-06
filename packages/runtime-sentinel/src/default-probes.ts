// packages/runtime-sentinel/src/default-probes.ts
// Fallback probe set used when a project ships no `.sentinel/probes.{ts,mjs}`.
// Generic enough to be useful in any HTTP service.

import { defineProbe } from './probe.js';
import { httpJson } from './http.js';
import type { Probe } from './types.js';

export function defaultProbes(): Probe[] {
  return [
    defineProbe('health', 'GET /health', async (ctx) => {
      const r = await httpJson<{ status?: string }>(ctx, '/health');
      if (!r.ok) return { status: 'fail', error: r.error, hint: 'service not reachable' };
      if (r.body?.status && r.body.status !== 'ok') {
        return { status: 'fail', error: `health.status=${r.body.status}` };
      }
      return { status: 'pass', details: { status: r.body?.status ?? 'unknown' } };
    }),
  ];
}
