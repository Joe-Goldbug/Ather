export function resolveLlmChatCompletionsUrl(baseUrl: string, explicitPath?: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('LLM_BASE_URL is empty');

  // If user already provides a full endpoint URL, use it directly.
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;

  // Optional override for providers that expose a non-standard path.
  const path = explicitPath?.trim();
  if (path) {
    if (/^https?:\/\//i.test(path)) return path.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${trimmed}${normalizedPath}`;
  }

  return `${trimmed}/chat/completions`;
}

