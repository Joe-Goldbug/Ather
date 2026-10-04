// apps/api/src/modules/auth/auth.module.ts
import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { DatabaseModule } from '../../common/database.js';
import { Resend } from 'resend';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    {
      provide: 'RESEND_CLIENT',
      useFactory: () => {
        return new Resend(process.env.RESEND_API_KEY || 're_dummy');
      },
    },
    AuthService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
