// @ts-check
/** @type {import('next').NextConfig} */
const path = require('node:path');
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3101').replace(/\/$/, '');
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  // Keep dev and production artifacts separate so `next build` output does not
  // poison later `next dev` chunk loading in this iCloud-backed workspace.
  distDir: isDev ? (process.env.NEXT_DEV_DIST_DIR ?? '.next-dev') : '.next',
  // [fix 2026-10-10] Dev rewrites proxy defaults to a 30s timeout, which killed
  // POST /api/v1/assessment-rounds whenever the Agnes LLM call (personalized
  // question generation) plus retry exceeded it — the browser saw a plain-text
  // "Internal Server Error". Raise the dev proxy ceiling; long calls are still
  // bounded server-side by THEME_AI_TIMEOUT_MS.
  ...(isDev ? { experimental: { proxyTimeout: 120_000 } } : {}),
  // [fix 2026-06-24] Disable React Strict Mode in dev to prevent the double-mount
  // RSC fetch abort that surfaces as `net::ERR_ABORTED` on /login?_rsc=… in
  // the browser console. Production keeps Strict Mode on (default).
  reactStrictMode: !isDev,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // [fix 2026-06-25] 把 @eva/core 也走 Next.js 自身的 babel 管线,
  // 避免 webpack alias 直接解析到 packages/core/dist/src/* 的 ESM 文件时,
  // 把它当作独立 module graph 加载 → 出现两个 React 实例 →
  // profile 页 "Cannot read properties of null (reading 'useInsertionEffect')"
  transpilePackages: ['@eva/core'],
  webpack: (config) => {
    config.resolve.alias['@eva/core$'] = path.resolve(__dirname, '../../packages/core/dist/src/index.js');
    config.resolve.alias['@eva/core/assessment'] = path.resolve(__dirname, '../../packages/core/dist/src/assessment/index.js');
    config.resolve.alias['@eva/core/shared'] = path.resolve(__dirname, '../../packages/core/dist/src/shared/index.js');
    config.resolve.alias['@eva/core/shared/locales'] = path.resolve(__dirname, '../../packages/core/dist/src/shared/locales.js');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@base-org/account': false,
      '@metamask/connect-evm': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
      '@walletconnect/ethereum-provider': false,
      accounts: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
      {
        // 用户头像等上传文件的静态资源代理（API /uploads/*）
        source: '/uploads/:path*',
        destination: `${apiBase}/uploads/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
