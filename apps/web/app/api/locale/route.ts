import { NextRequest, NextResponse } from 'next/server';

const LOCALE_COOKIE = 'eva_locale';
const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja', 'es'] as const;

export async function POST(request: NextRequest) {
  try {
    const { locale } = await request.json();

    if (!SUPPORTED_LOCALES.includes(locale as typeof SUPPORTED_LOCALES[number])) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
