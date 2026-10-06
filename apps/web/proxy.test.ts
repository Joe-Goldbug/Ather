import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('product route guard', () => {
  it('keeps product routes closed by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVA_LOCAL_PRODUCT_PREVIEW', '');
    const response = proxy(new NextRequest('http://127.0.0.1:3000/login'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('permits explicit local development preview', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVA_LOCAL_PRODUCT_PREVIEW', '1');
    const response = proxy(new NextRequest('http://127.0.0.1:3000/login'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('never opens product routes in production or on a public host', () => {
    vi.stubEnv('EVA_LOCAL_PRODUCT_PREVIEW', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(proxy(new NextRequest('http://127.0.0.1:3000/login')).headers.get('location'))
      .toBe('http://localhost:3000/');
    vi.stubEnv('NODE_ENV', 'development');
    expect(proxy(new NextRequest('https://eva.live/login')).headers.get('location'))
      .toBe('https://eva.live/');
  });
});
