// apps/web/proxy.ts
// Reads Accept-Language on first visit, writes eva_locale cookie.
// Respects existing cookie (user's explicit choice wins).

import { NextRequest, NextResponse } from 'next/server';

const LOCALE_COOKIE = 'eva_locale';
const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja', 'es'] as const;

/** Match an Accept-Language string to a supported locale (quality-value aware) */
function matchAcceptLanguage(header: string): string | null {
  const parts = header.split(',').map((p) => {
    const [lang, q = 'q=1'] = p.trim().split(';');
    const quality = parseFloat(q.replace('q=', '')) || 0;
    return { lang: lang.trim(), quality };
  });
  parts.sort((a, b) => b.quality - a.quality);
  for (const { lang } of parts) {
    // Exact match
    if (SUPPORTED_LOCALES.includes(lang as typeof SUPPORTED_LOCALES[number])) {
      return lang;
    }
    // Short-code fallback (e.g. "zh" → "zh-CN")
    const short = lang.split('-')[0];
    if (short === 'zh') return 'zh-CN';
    if (SUPPORTED_LOCALES.includes(short as typeof SUPPORTED_LOCALES[number])) {
      return short;
    }
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localProductPreview = process.env.NODE_ENV === 'development' &&
    process.env.EVA_LOCAL_PRODUCT_PREVIEW === '1' &&
    ['localhost', '127.0.0.1'].includes(request.nextUrl.hostname);

  // The public site is intentionally a narrow, static surface. Old product
  // routes remain in the codebase for later work but are not publicly usable.
  if (!localProductPreview && pathname !== '/' && pathname !== '/whitepaper' && pathname !== '/api/locale') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Already set by user — do not override
  if (request.cookies.has(LOCALE_COOKIE)) {
    return NextResponse.next();
  }

  const acceptLang = request.headers.get('accept-language') ?? '';
  const matched = matchAcceptLanguage(acceptLang);

  if (!matched) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(LOCALE_COOKIE, matched, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static files and Next internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
