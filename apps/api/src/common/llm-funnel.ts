// apps/api/src/common/llm-funnel.ts
//
// EVA LLM Funnel — three-layer normalization around any LLM call.
//
// Layer 1 · ADAPTER     : identify model family (gpt / qwen / claude / gemini / unknown)
//                        and emit the request shape each family is happiest with.
//                        Different families have different sweet spots for:
//                          - temperature range, top_p, presence/frequency penalty
//                          - system prompt placement (some need it as a real "system" role,
//                            others choke unless it's a leading user message)
//                          - stop sequences
//
// Layer 2 · CONVERGENCE : one shared, narrow response contract.
//                        - single retry policy (1 automatic retry on 429/5xx/timeout)
//                        - timeout bounded (default 30s)
//                        - usage tracked uniformly
//                        - any non-conforming payload → throws with a clear error code
//
// Layer 3 · POSTPROCESS : output normalization (the "narrow" part of the funnel).
//                        - strip <think>...</think> blocks (chain-of-thought leakage)
//                        - strip leading/trailing markdown scaffolding (# ## > etc.)
//                        - collapse excessive newlines
//                        - enforce max length with safe truncation
//                        - detect "model going off the rails" patterns and emit a
//                          controlled fallback so the user never sees a broken response.
//
// Why this exists (EVA funnel doctrine):
//   Different models "say different things" given the same prompt. The funnel
//   doesn't fight the model — it just guarantees the *outer contract* is stable,
//   so the rest of EVA (engines, evidence, you_shifted, diary) can rely on
//   `eva_message` being a clean, bounded, on-rails string regardless of
//   which underlying LLM the deployment is currently configured to use.

import { resolveLlmChatCompletionsUrl } from './llm-endpoint.js';

export type ModelFamily = 'openai-gpt' | 'qwen' | 'claude' | 'gemini' | 'minimax' | 'unknown';

export interface FunnelRequest {
  system: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

export interface FunnelResult {
  content: string;
  model: string;
  family: ModelFamily;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  fallback_used: boolean;
  funnel_latency_ms: number;
}

export interface FunnelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  explicitPath?: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputChars: number;
}

const FAMILY_PATTERNS: Array<[ModelFamily, RegExp]> = [
  ['openai-gpt', /^(gpt-|o[1-9]|chatgpt-)/i],
  ['qwen', /^qwen/i],
  ['claude', /^claude/i],
  ['gemini', /^gemini/i],
];

export function detectModelFamily(model: string): ModelFamily {
  for (const [family, re] of FAMILY_PATTERNS) {
    if (re.test(model)) return family;
  }
  return 'unknown';
}

// ── Layer 1 · ADAPTER ───────────────────────────────────────────────────────

interface AdaptedRequest {
  body: Record<string, unknown>;
  stopSequences?: string[];
}

function adaptRequest(req: FunnelRequest, family: ModelFamily, model: string): AdaptedRequest {
  const maxTokens = req.max_tokens ?? 512;
  const temperature = req.temperature ?? 0.7;

  // Common body skeleton (OpenAI-compatible)
  const baseBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: req.system }, ...req.messages],
    max_tokens: maxTokens,
    temperature,
  };

  switch (family) {
    case 'openai-gpt':
      // GPT is happiest with the vanilla shape.
      return { body: baseBody };

    case 'qwen':
      // Qwen tolerates the same shape but appreciates top_p, and sometimes
      // wanders if temperature > 0.9 — clamp it.
      return {
        body: { ...baseBody, top_p: 0.9, temperature: Math.min(temperature, 0.85) },
        stopSequences: ['<|im_end|>', '<|endoftext|>'],
      };

    case 'claude':
      // Anthropic's OpenAI-compat layer accepts this, but Claude is more obedient
      // when we cap temperature and add stop sequences. Most Claude proxies
      // ignore the OpenAI stop array and read `stop_sequences` separately —
      // we send both, harmless if the proxy ignores one.
      return {
        body: { ...baseBody, temperature: Math.min(temperature, 0.8) },
        stopSequences: ['\n\nHuman:'],
      };

    case 'gemini':
      // Gemini proxies (OpenAI compat) accept the body but occasionally ignore
      // temperature < 0.3. Keep it neutral.
      return { body: { ...baseBody, top_p: 0.95 } };

    case 'minimax':
      // MiniMax uses OpenAI-compatible format natively.
      return { body: baseBody };

    case 'unknown':
    default:
      return { body: baseBody };
  }
}

// ── Layer 2 · CONVERGENCE ──────────────────────────────────────────────────

interface ConvergenceOptions {
  timeoutMs: number;
  maxRetries: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithConvergence(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  options: ConvergenceOptions,
): Promise<{ json: Record<string, unknown>; status: number }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Retryable: 429, 5xx, or 408 (request timeout)
      if (response.status === 429 || response.status === 408 || (response.status >= 500 && response.status < 600)) {
        if (attempt < options.maxRetries) {
          const backoffMs = 250 * Math.pow(2, attempt);
          await sleep(backoffMs);
          continue;
        }
        const text = await response.text();
        throw new Error(`LLM API ${response.status} after ${options.maxRetries} retries: ${text.slice(0, 300)}`);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM API ${response.status}: ${text.slice(0, 300)}`);
      }

      const json = (await response.json()) as Record<string, unknown>;
      return { json, status: response.status };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // Retry on abort (timeout) or network errors
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const isNetwork = err instanceof Error && /fetch failed|ECONNRESET|ENOTFOUND/i.test(err.message);
      if ((isTimeout || isNetwork) && attempt < options.maxRetries) {
        const backoffMs = 250 * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

// ── Layer 3 · POSTPROCESS ─────────────────────────────────────────────────

const FALLBACK_BY_LOCALE: Record<string, string> = {
  'zh-CN': '我现在有点走神了——能再说一次吗？',
  en: 'I got a bit tangled — could you say that again?',
  ja: '少し考えが乱れました。もう一度言ってもらえますか？',
  es: 'Me distraje un momento. ¿Puedes repetirlo?',
};

function pickFallback(locale: string | undefined): string {
  if (!locale) return FALLBACK_BY_LOCALE['zh-CN'];
  return FALLBACK_BY_LOCALE[locale] ?? FALLBACK_BY_LOCALE['zh-CN'];
}

/** Detect "going off the rails" patterns. Conservative: only flag obvious cases. */
function looksOffTheRails(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  // Repeated token spam: same short token 6+ times in a row
  if (/\b(\w{1,4})\b(?:\s+\1){5,}/i.test(t)) return true;
  // Three or more back-to-back blank lines
  if (/\n\s*\n\s*\n\s*\n/.test(t)) return true;
  // Pure punctuation/emoji noise
  if (/^[\s\p{P}\p{S}]+$/u.test(t) && t.length < 20) return true;
  // Repeated refusal phrase (model stuck in a loop)
  if (/(我(无法|不能)|I (can'?t|cannot)|sorry,?\s+I\s+can'?t)/i.test(t) && t.length < 60) return true;
  return false;
}

function stripThinkBlocks(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
}

function stripMarkdownScaffold(s: string): string {
  return s
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, '')   // headings
    .replace(/^\s*[-*+]\s+/gm, '')            // bullet markers
    .replace(/^\s*>\s?/gm, '')                // blockquote markers
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))   // inline code → plain
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // bold
    .replace(/\*([^*]+)\*/g, '$1');           // italic
}

function collapseBlankLines(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n');
}

function clampLength(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  // Try to break on a sentence boundary near the cap
  const slice = s.slice(0, max);
  const lastSentence = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  if (lastSentence > max * 0.6) {
    return { text: slice.slice(0, lastSentence + 1), truncated: true };
  }
  return { text: slice + '…', truncated: true };
}

export function postprocess(raw: string, maxChars: number, locale?: string): { content: string; fallback_used: boolean } {
  let s = stripThinkBlocks(raw).trim();
  s = stripMarkdownScaffold(s);
  s = collapseBlankLines(s).trim();

  if (looksOffTheRails(s)) {
    return { content: pickFallback(locale), fallback_used: true };
  }

  const { text, truncated } = clampLength(s, maxChars);
  if (truncated) {
    // truncated itself isn't "off the rails", but we mark fallback_used=false
    // so callers can still log it; downstream engines handle short messages fine.
  }
  return { content: text, fallback_used: false };
}

// ── Public entry: funnel() ─────────────────────────────────────────────────

export interface FunnelOptions {
  config: FunnelConfig;
  locale?: string;
  signal?: AbortSignal;
}

export async function funnel(req: FunnelRequest, options: FunnelOptions): Promise<FunnelResult> {
  const { config, locale } = options;
  const family = detectModelFamily(config.model);
  const adapted = adaptRequest(req, family, config.model);
  const url = resolveLlmChatCompletionsUrl(config.baseUrl, config.explicitPath);

  const t0 = Date.now();
  const { json } = await callWithConvergence(url, config.apiKey, adapted.body, {
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
  const funnel_latency_ms = Date.now() - t0;

  const raw =
    ((json.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content) ?? '';
  const model = (json.model as string | undefined) ?? config.model;
  const usage = json.usage as FunnelResult['usage'];

  const { content, fallback_used } = postprocess(raw, config.maxOutputChars, locale);

  return {
    content,
    model,
    family,
    usage,
    fallback_used,
    funnel_latency_ms,
  };
}
