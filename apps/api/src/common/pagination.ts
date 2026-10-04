// apps/api/src/common/pagination.ts
// Safe pagination param parser — prevents NaN/negative/oversized values from causing 500s

export function parsePage(raw: string | undefined, defaultVal = 1): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return n;
}

export function parseLimit(raw: string | undefined, defaultVal: number, max = 200): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

export function parseOffset(raw: string | undefined): number {
  const n = Number(raw ?? 0);
  return Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : 0;
}
