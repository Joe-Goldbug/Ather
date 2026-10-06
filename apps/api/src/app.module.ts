// apps/api/src/app.module.ts
// Eva-Solana 闭环装配（正式主链路：主题轮 → 结果 → 反馈 → 轮次历史）
//
// 依据 docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md：
//   chat / report / portrait / evidence / captures 均为「非正式/兼容路径」，
//   主题轮对 portrait 表零引用，故本装配只引入闭环必需模块。
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './common/database.js';
import { RedisModule } from './common/redis.module.js';
import { SessionInterceptor } from './common/session.interceptor.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ThemeAssessmentModule } from './modules/theme-assessment/theme-assessment.module.js';

@Module({
  imports: [
    DatabaseModule,        // Global — Neon Pool + RLS 租户隔离
    RedisModule,           // Global — Redis service（OTP Lua 脚本）
    AuthModule,            // Global — 邮箱 OTP 认证
    ThemeAssessmentModule, // 主题轮主链路
  ],
  providers: [
    // 必须先于路由执行：把 session token 注入 AsyncLocalStorage，
    // 供 database.ts 的 set_config('app.session_token') 消费。缺了会静默越权。
    { provide: APP_INTERCEPTOR, useClass: SessionInterceptor },
  ],
})
export class AppModule {}
