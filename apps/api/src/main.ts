// apps/api/src/main.ts
import 'dotenv/config'; // Add dotenv config to automatically load .env
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';
import { resolveListenHost } from './common/listen-host.js';
import { assertProductionDataPlaneEnvironment } from './deploy/data-plane-preflight.js';

function warnRemoteResourcesInDev() {
  const redisUrl = process.env.REDIS_URL ?? '';
  const dbUrl = process.env.DATABASE_URL ?? '';
  const warnings: string[] = [];

  if (redisUrl.includes('upstash.io') && process.env.MOCK_REDIS !== '1') {
    warnings.push('  • REDIS_URL points to Upstash (remote) — set MOCK_REDIS=1 to use local mock');
  }
  if (dbUrl.includes('neon.tech') || dbUrl.includes('supabase.co')) {
    // DB is acceptable for dev (no idle-polling problem) but worth noting
    warnings.push('  • DATABASE_URL points to remote Neon — this is fine for dev but be aware of usage');
  }

  if (warnings.length > 0) {
    console.warn('\n╔══════════════════════════════════════════════════════════════╗');
    console.warn('║  ⚠️  LOCAL DEV using REMOTE resources:                       ║');
    console.warn('╚══════════════════════════════════════════════════════════════╝');
    warnings.forEach((w) => console.warn(w));
    console.warn('');
  }
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    assertProductionDataPlaneEnvironment('api', process.env);
  } else {
    // Dev-mode safety: warn if remote resources are connected
    warnRemoteResourcesInDev();
  }

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // Global ValidationPipe — enforces DTO class-validator decorators
  // (@IsUUID / @MinLength / @MaxLength / @IsIn / etc.) on every route
  // that uses a @Body()-decorated DTO. Without this, the decorators are
  // decorative metadata that Nest never reads and inputs are unvalidated.
  //   whitelist: only fields present in the DTO class are kept
  //   forbidNonWhitelisted: reject requests with extra fields (400)
  //   transform: coerce plain JSON to typed DTO instances
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
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
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
  // CRITICAL: bind 0.0.0.0 so Railway / Docker / Fly etc. can route
  // external traffic into the container. Without this, NestJS binds to
  // 127.0.0.1 in some Node versions and the platform proxy returns 502.
  const host = resolveListenHost(process.env.EVA_LISTEN_HOST);
  await app.listen(port, host);
  console.log(`[EVA API] Running on http://${host}:${port}`);
  if (!isProd) {
    console.log(`[EVA API] Mode: development | MOCK_REDIS=${process.env.MOCK_REDIS ?? '0'} | DISABLE_QUEUES=${process.env.DISABLE_QUEUES ?? '0'}`);
  }
}

bootstrap().catch((err) => {
  console.error('[EVA API] bootstrap failed:', err);
  process.exit(1);
});

/**
 * 进程级兜底 —— 此前完全没有。
 *
 * 没有这两个 handler 时，任何逃逸出请求作用域的异常（例如 pg 在空闲 client 上
 * emit 的 `error`、未被 await 的 Promise 拒绝）都会让**整个 API 进程退出**，
 * 用户侧表现为全站 5xx，而不只是那一个请求失败。
 *
 * 语义选择：记录并保持存活。请求级错误已由 Nest 的异常过滤器处理，能走到这里的
 * 是没有归属的异常；直接杀进程只会放大影响面。若进程已处于不可信状态，编排层
 * （Railway / Fly）的健康检查会接管重启。
 */
process.on('unhandledRejection', (reason) => {
  console.error('[EVA API] unhandledRejection (kept alive):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[EVA API] uncaughtException (kept alive):', err);
});
