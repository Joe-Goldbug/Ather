export function resolveListenHost(configuredHost?: string): string {
  const host = configuredHost?.trim();
  return host || '0.0.0.0';
}
