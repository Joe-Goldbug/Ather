import { createHash } from 'node:crypto';

export type RuntimeService = 'api' | 'worker';

type Check = {
  name: string;
  ok: boolean;
};

type Fingerprints = {
  database_target: string | null;
  database_role: string | null;
  redis_target: string | null;
};

export type DataPlanePreflightResult = {
  service: RuntimeService;
  ok: boolean;
  checks: Check[];
  fingerprints: Fingerprints;
};

type ParsedTarget = {
  valid: boolean;
  targetFingerprint: string | null;
  roleFingerprint: string | null;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PLACEHOLDER_SECRET = /^(?:test(?:[-_].*)?|placeholder|changeme|redacted|dummy|secret|re_dummy|re_123456789)$/i;

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseTarget(
  raw: string | undefined,
  protocols: string[],
  defaultPort: string,
  requireDatabase: boolean,
): ParsedTarget {
  try {
    const url = new URL(raw ?? '');
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const valid = protocols.includes(url.protocol)
      && Boolean(url.hostname)
      && !LOCAL_HOSTS.has(url.hostname.toLowerCase())
      && Boolean(url.username)
      && Boolean(url.password)
      && (!requireDatabase || Boolean(database));
    if (!valid) return { valid: false, targetFingerprint: null, roleFingerprint: null };

    const normalizedProtocol = url.protocol === 'postgres:' ? 'postgresql:' : url.protocol.toLowerCase();
    const target = [
      normalizedProtocol,
      url.hostname.toLowerCase(),
      url.port || defaultPort,
      database || '0',
    ].join('|');
    return {
      valid: true,
      targetFingerprint: fingerprint(target),
      roleFingerprint: fingerprint(decodeURIComponent(url.username)),
    };
  } catch {
    return { valid: false, targetFingerprint: null, roleFingerprint: null };
  }
}

function secretConfigured(value: string | undefined): boolean {
  const secret = value?.trim() ?? '';
  return secret.length >= 8 && !PLACEHOLDER_SECRET.test(secret);
}

function remoteHttpsUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function frontendUrlsValid(value: string | undefined): boolean {
  const urls = value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
  return urls.length > 0 && urls.every(remoteHttpsUrl);
}

function fromEmailValid(value: string | undefined): boolean {
  const address = value?.match(/<([^>]+)>/)?.[1] ?? value?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

export function inspectDataPlaneEnvironment(
  service: RuntimeService,
  env: NodeJS.ProcessEnv,
): DataPlanePreflightResult {
  const database = parseTarget(env.DATABASE_URL, ['postgres:', 'postgresql:'], '5432', true);
  const redis = parseTarget(env.REDIS_URL, ['redis:', 'rediss:'], '6379', false);
  const llmKey = env.OPENAI_API_KEY?.trim() || env.LLM_API_KEY?.trim();
  const llmBase = env.OPENAI_BASE_URL?.trim() || env.LLM_BASE_URL?.trim();
  const llmModel = env.OPENAI_MODEL?.trim() || env.LLM_MODEL?.trim();

  const checks: Check[] = [
    { name: 'node_env', ok: env.NODE_ENV === 'production' },
    { name: 'database_url', ok: database.valid },
    { name: 'redis_url', ok: redis.valid },
    { name: 'queues_enabled', ok: env.DISABLE_QUEUES !== '1' },
    { name: 'mocks_disabled', ok: env.MOCK_DB !== '1' && env.MOCK_REDIS !== '1' && env.EVA_LOCAL_MOCK_LLM !== '1' },
    { name: 'llm_api_key', ok: secretConfigured(llmKey) },
    { name: 'llm_base_url', ok: remoteHttpsUrl(llmBase) },
    { name: 'llm_model', ok: Boolean(llmModel) },
    { name: 'dynamic_script_api_key', ok: secretConfigured(env.DYNAMIC_SCRIPT_API_KEY) },
    { name: 'dynamic_script_api_base', ok: remoteHttpsUrl(env.DYNAMIC_SCRIPT_API_BASE) },
  ];

  if (service === 'api') {
    checks.push(
      { name: 'resend_api_key', ok: secretConfigured(env.RESEND_API_KEY) },
      { name: 'resend_from_email', ok: fromEmailValid(env.RESEND_FROM_EMAIL) },
      { name: 'frontend_url', ok: frontendUrlsValid(env.FRONTEND_URL) },
    );
  }

  return {
    service,
    ok: checks.every((check) => check.ok),
    checks,
    fingerprints: {
      database_target: database.targetFingerprint,
      database_role: database.roleFingerprint,
      redis_target: redis.targetFingerprint,
    },
  };
}

export function assertProductionDataPlaneEnvironment(
  service: RuntimeService,
  env: NodeJS.ProcessEnv,
): DataPlanePreflightResult {
  const result = inspectDataPlaneEnvironment(service, env);
  if (!result.ok) {
    const failedChecks = result.checks.filter((check) => !check.ok).map((check) => check.name);
    throw new Error(`[startup] production data-plane preflight failed: ${failedChecks.join(', ')}`);
  }
  return result;
}
