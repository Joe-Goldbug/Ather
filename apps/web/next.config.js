// @ts-check
/** @type {import('next').NextConfig} */
const path = require('node:path');
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  // Keep dev and production artifacts separate so `next build` output does not
  // poison later `next dev` chunk loading in this iCloud-backed workspace.
  distDir: isDev ? '.next-dev' : '.next',
  // [fix 2026-06-24] Disable React Strict Mode in dev to prevent the double-mount
  // RSC fetch abort that surfaces as `net::ERR_ABORTED` on /login?_rsc=… in
  // the browser console. Production keeps Strict Mode on (default).
  reactStrictMode: !isDev,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // [fix 2026-06-25] 把 @ather/core 也走 Next.js 自身的 babel 管线,
  // 避免 webpack alias 直接解析到 packages/core/dist/src/* 的 ESM 文件时,
  // 把它当作独立 module graph 加载 → 出现两个 React 实例
  transpilePackages: ['@ather/core'],
  webpack: (config) => {
    config.resolve.alias['@ather/core$'] = path.resolve(__dirname, '../../packages/core/dist/src/index.js');
    config.resolve.alias['@ather/core/assessment'] = path.resolve(__dirname, '../../packages/core/dist/src/assessment/index.js');
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
