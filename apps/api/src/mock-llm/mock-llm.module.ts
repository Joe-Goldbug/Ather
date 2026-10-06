import { Module } from '@nestjs/common';
import { MockLlmController } from './mock-llm.controller.js';

@Module({
  controllers: [MockLlmController],
})
export class MockLlmModule {}
