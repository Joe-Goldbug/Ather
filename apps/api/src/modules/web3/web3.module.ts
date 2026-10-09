import { Module } from '@nestjs/common';
import { BaseService } from './base.service.js';
import { WalletService } from './wallet.service.js';
import { CredentialAnchorProcessor } from './credential-anchor.processor.js';
import { Web3Controller } from './web3.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [Web3Controller],
  providers: [BaseService, WalletService, CredentialAnchorProcessor],
  exports: [BaseService, WalletService, CredentialAnchorProcessor],
})
export class Web3Module {}
