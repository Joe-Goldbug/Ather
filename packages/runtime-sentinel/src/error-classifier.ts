// packages/runtime-sentinel/src/error-classifier.ts
// Classify errors into transient, permanent, or config categories.

export type ErrorType = 'transient' | 'permanent' | 'config';

export interface ErrorClassification {
  type: ErrorType;
  category: string;
  message: string;
  suggestion: string;
  autoFixable: boolean;
  retryable: boolean;
}

/**
 * Classify an error to determine if it's worth retrying.
 * - transient: network/timeout issues, worth retrying
 * - permanent: 404, 401, business logic errors, don't retry
 * - config: missing env vars, wrong URLs, suggest fix
 */
export function classifyError(
  error: Error | string,
  context?: { statusCode?: number; endpoint?: string }
): ErrorClassification {
  const msg = typeof error === 'string' ? error : error.message;
  const status = context?.statusCode;

  // Config errors — missing setup
  if (msg.includes('redisUrl is not configured')) {
    return {
      type: 'config',
      category: 'missing_redis',
      message: 'Redis URL not configured',
      suggestion: 'Set REDIS_URL env var or pass --redis <url>',
      autoFixable: false,
      retryable: false,
    };
  }

  if (msg.includes('API_BASE') || msg.includes('VITE_API_BASE')) {
    return {
      type: 'config',
      category: 'missing_api_base',
      message: 'API base URL not configured',
      suggestion: 'Set API_BASE env var or pass --base <url>',
      autoFixable: false,
      retryable: false,
    };
  }

  if (msg.includes('DATABASE_URL') || msg.includes('database')) {
    return {
      type: 'config',
      category: 'missing_database',
      message: 'Database connection not configured',
      suggestion: 'Set DATABASE_URL env var',
      autoFixable: false,
      retryable: false,
    };
  }

  // HTTP status codes
  if (status === 404) {
    return {
      type: 'permanent',
      category: 'not_found',
      message: `Endpoint not found (404)`,
      suggestion: 'Check endpoint path or API version',
      autoFixable: false,
      retryable: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      type: 'permanent',
      category: 'auth_failed',
      message: `Authentication failed (${status})`,
      suggestion: 'Check credentials or token validity',
      autoFixable: false,
      retryable: false,
    };
  }

  if (status === 400) {
    return {
      type: 'permanent',
      category: 'bad_request',
      message: `Bad request (400)`,
      suggestion: 'Check request payload or parameters',
      autoFixable: false,
      retryable: false,
    };
  }

  if (status === 500 || status === 502 || status === 503) {
    return {
      type: 'transient',
      category: 'server_error',
      message: `Server error (${status})`,
      suggestion: 'API may be restarting. Will retry automatically.',
      autoFixable: true,
      retryable: true,
    };
  }

  // Network errors — transient
  if (msg.includes('ECONNREFUSED')) {
    return {
      type: 'transient',
      category: 'connection_refused',
      message: 'Connection refused',
      suggestion: 'API server may not be running. Try: bun run dev:api',
      autoFixable: true,
      retryable: true,
    };
  }

  if (msg.includes('ECONNRESET')) {
    return {
      type: 'transient',
      category: 'connection_reset',
      message: 'Connection reset by peer',
      suggestion: 'Network issue or API restart. Will retry.',
      autoFixable: false,
      retryable: true,
    };
  }

  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
    return {
      type: 'transient',
      category: 'timeout',
      message: 'Request timeout',
      suggestion: 'Network or API latency issue. Will retry.',
      autoFixable: false,
      retryable: true,
    };
  }

  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return {
      type: 'transient',
      category: 'dns_error',
      message: 'DNS resolution failed',
      suggestion: 'Network connectivity issue. Will retry.',
      autoFixable: false,
      retryable: true,
    };
  }

  // Redis-specific errors
  if (msg.includes('Redis') || msg.includes('redis')) {
    if (msg.includes('ECONNREFUSED')) {
      return {
        type: 'transient',
        category: 'redis_unavailable',
        message: 'Redis connection refused',
        suggestion: 'Start Redis: redis-server or docker run -d -p 6379:6379 redis',
        autoFixable: true,
        retryable: true,
      };
    }
    return {
      type: 'transient',
      category: 'redis_error',
      message: 'Redis error',
      suggestion: 'Check Redis connection and configuration',
      autoFixable: false,
      retryable: true,
    };
  }

  // JSON parse errors — usually permanent
  if (msg.includes('JSON') || msg.includes('parse')) {
    return {
      type: 'permanent',
      category: 'invalid_response',
      message: 'Invalid response format',
      suggestion: 'API returned non-JSON or malformed response',
      autoFixable: false,
      retryable: false,
    };
  }

  // Default: assume transient for unknown errors
  return {
    type: 'transient',
    category: 'unknown',
    message: msg,
    suggestion: 'Unknown error. Will retry.',
    autoFixable: false,
    retryable: true,
  };
}

/**
 * Get auto-fix suggestions for a classification.
 */
export function getAutoFixSuggestions(
  classification: ErrorClassification
): Array<{ command: string; description: string; riskLevel: 'low' | 'medium' | 'high' }> {
  const suggestions: Array<{ command: string; description: string; riskLevel: 'low' | 'medium' | 'high' }> = [];

  switch (classification.category) {
    case 'connection_refused':
      suggestions.push({
        command: 'bun run dev:api',
        description: 'Start the API development server',
        riskLevel: 'low',
      });
      break;

    case 'redis_unavailable':
      suggestions.push({
        command: 'redis-server',
        description: 'Start Redis server locally',
        riskLevel: 'low',
      });
      suggestions.push({
        command: 'docker run -d -p 6379:6379 redis',
        description: 'Start Redis in Docker',
        riskLevel: 'low',
      });
      break;

    case 'server_error':
      suggestions.push({
        command: 'bun run dev:api',
        description: 'Restart the API server',
        riskLevel: 'medium',
      });
      break;

    case 'missing_redis':
      suggestions.push({
        command: 'export REDIS_URL=redis://localhost:6379',
        description: 'Set Redis URL environment variable',
        riskLevel: 'low',
      });
      break;

    case 'missing_api_base':
      suggestions.push({
        command: 'export API_BASE=http://localhost:3001',
        description: 'Set API base URL environment variable',
        riskLevel: 'low',
      });
      break;
  }

  return suggestions;
}
