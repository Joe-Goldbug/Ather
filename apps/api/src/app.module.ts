// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './common/database.js';
import { RedisModule } from './common/redis.module.js';
import { SessionInterceptor } from './common/session.interceptor.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { DiaryModule } from './modules/diary/diary.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { ConsentModule } from './modules/consent/consent.module.js';
import { AgentContextModule } from './modules/agent-context/agent-context.module.js';
import { WeeklyReviewsModule } from './modules/weekly-reviews/weekly-reviews.module.js';
import { AssessmentModule } from './modules/assessment/assessment.module.js';
import { DynamicScriptModule } from './modules/assessment/dynamic-script.module.js';
import { CorrectionsModule } from './modules/corrections/corrections.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { QueueModule } from './queue/queue.module.js';
import { HealthController } from './health.controller.js';
import { MockLlmModule } from './mock-llm/mock-llm.module.js';
import { RuntimeSentinelModule } from './modules/runtime-sentinel/runtime-sentinel.module.js';
import { CapturesModule } from './modules/captures/captures.module.js';
import { CalibrationModule } from './modules/calibration/calibration.module.js';
import { PortraitV1Module } from './modules/portrait/portrait-v1.module.js';
import { ThemeAssessmentModule } from './modules/theme-assessment/theme-assessment.module.js';
import { ProductEventsModule } from './modules/product-events/product-events.module.js';
import { ProductFeedbackModule } from './modules/product-feedback/product-feedback.module.js';
import { CredentialModule } from './modules/credential/credential.module.js';
import { Web3Module } from './modules/web3/web3.module.js';
import { UnderstandingModule } from './modules/understanding/understanding.module.js';

const optionalModules = [
  ...(process.env.EVA_LOCAL_MOCK_LLM === '1' ? [MockLlmModule] : []),
  ...(process.env.NODE_ENV === 'production' || process.env.DYNAMIC_SCRIPT_API_KEY?.trim()
    ? [DynamicScriptModule]
    : []),
];

@Module({
  imports: [
    DatabaseModule,   // Global — shared Neon Pool
    RedisModule,      // Global — Redis service
    QueueModule,      // Global — BullMQ queue service
    CredentialModule, // Phase 3 — Verifiable credentials export & verification
    Web3Module,       // Phase 5 & 6 — Base Sepolia optional wallet binding & anchor loop
    ConsentModule,   // Global — GDPR / data authorization
    DiaryModule,     // Global — diary CRUD
    EvidenceModule,   // Evidence event persistence — @Global()
    AuditModule,     // Audit log queries (read-only)
    AuthModule,
    ChatModule,
    ReportModule,
    AgentContextModule,
    WeeklyReviewsModule,
    AssessmentModule, // Task 4: Assessment backend + assessment_runs
    CorrectionsModule, // Task 9: User correction module
    ProfileModule,
    RuntimeSentinelModule, // Phase A — runtime sentinel snapshot + cleanup
    CapturesModule,        // Stage 1 — reality fragment captures (replaces diary)
    CalibrationModule,     // Stage 1 — calibration rounds + correction candidates + shift detection
    PortraitV1Module,      // Continuous portrait v1 — fail-closed, legacy-free reads
    ThemeAssessmentModule, // Theme-based Track A rounds; no formal portrait writes
    ProductEventsModule, // Authenticated product telemetry for the internal admin
    ProductFeedbackModule, // Authenticated user feedback and its matching event
    UnderstandingModule, // Bounded, explicitly authorized understanding conversations
    ...optionalModules,
  ],
  controllers: [HealthController],
  providers: [
    // Global interceptor: wraps every authenticated request in AsyncLocalStorage
    // context so Database.pool propagates app.session_token reliably
    { provide: APP_INTERCEPTOR, useClass: SessionInterceptor },
  ],
})
export class AppModule {}
