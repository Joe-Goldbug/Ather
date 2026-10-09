import { Module } from '@nestjs/common';
import { CredentialService } from './credential.service.js';
import { CredentialController, WellKnownCredentialController } from './credential.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CredentialController, WellKnownCredentialController],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
