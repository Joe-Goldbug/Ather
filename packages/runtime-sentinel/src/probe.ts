// packages/runtime-sentinel/src/probe.ts
// `defineProbe` is the user-facing factory. It is intentionally small —
// just an identity helper that gives type inference and a stable shape.

import type { Probe, ProbeOutcome, SentinelContext } from './types.js';

export interface DefineProbeOptions {
  id: string;
  label?: string;
  skipIf?: (ctx: SentinelContext) => boolean | Promise<boolean>;
}

/**
 * Define a probe. Three forms:
 *
 *   defineProbe('health', async (ctx) => ({ status: 'pass' }))
 *   defineProbe('health', 'GET /health', async (ctx) => ({ status: 'pass' }))
 *   defineProbe({ id: 'health', label: 'Liveness', skipIf: ... }, async (ctx) => ({...}))
 */
export function defineProbe(
  idOrOpts: string | DefineProbeOptions,
  labelOrFn: string | ((ctx: SentinelContext) => Promise<ProbeOutcome>),
  maybeFn?: (ctx: SentinelContext) => Promise<ProbeOutcome>,
): Probe {
  let id: string;
  let label: string;
  let skipIf: DefineProbeOptions['skipIf'];
  let fn: (ctx: SentinelContext) => Promise<ProbeOutcome>;

  if (typeof idOrOpts === 'string') {
    id = idOrOpts;
    if (typeof labelOrFn === 'string') {
      label = labelOrFn;
      fn = maybeFn!;
    } else {
      label = idOrOpts;
      fn = labelOrFn;
    }
  } else {
    id = idOrOpts.id;
    label = idOrOpts.label ?? idOrOpts.id;
    skipIf = idOrOpts.skipIf;
    fn = (typeof labelOrFn === 'function' ? labelOrFn : maybeFn!) as typeof fn;
  }

  if (typeof fn !== 'function') {
    throw new Error(`defineProbe('${id}'): missing async run function`);
  }

  return { id, label, skipIf, run: fn };
}
