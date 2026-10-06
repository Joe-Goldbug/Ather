// Eva-web3 API — 闭环主链路服务
//
// 相比最初的 anonymous 模式，本次装配引入：
//   - cookie-parser：AuthGuard 需读 session cookie
//   - listen-host：部署到 Railway/Fly 时必须监听 0.0.0.0
//   - AUTH 生产环境必需项校验：DATABASE_URL / REDIS_URL / RESEND_API_KEY
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { resolveListenHost } from './common/listen-host.js';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const missing = ['DATABASE_URL', 'REDIS_URL', 'RESEND_API_KEY'].filter(
      (k) => !process.env[k] || process.env[k]?.trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(`[startup] Missing required env: ${missing.join(', ')}`);
    }
  }

  const app = await NestFactory.create(AppModule);

  // AuthGuard 依赖 req.cookies['eva_session'] / ['ather_session']，必须先于路由挂载
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
    ],
    credentials: true,
  });

  if (!isProd) {
    app.use((req, res, next) => {
      console.log(`[REQ] ${req.method} ${req.url}`);
      next();
    });
  }

  const port = Number(process.env.PORT ?? 3001);
  const host = resolveListenHost(process.env.EVA_LISTEN_HOST ?? process.env.ATHER_LISTEN_HOST);
  await app.listen(port, host);
  console.log(
    `[Eva-web3 API] Running on http://${host}:${port} | ` +
      `NODE_ENV=${process.env.NODE_ENV ?? 'development'} | ` +
      `MOCK_REDIS=${process.env.MOCK_REDIS === '1' ? 1 : 0}`,
  );
}

bootstrap().catch((err) => {
  console.error('[Eva-web3 API] bootstrap failed:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Eva-web3 API] unhandledRejection (kept alive):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Eva-web3 API] uncaughtException (kept alive):', err);
});
