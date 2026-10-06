import { Body, Controller, Post } from '@nestjs/common';
import { buildMockContent } from './mock-llm.router.js';

@Controller('mock-llm')
export class MockLlmController {
  @Post('chat/completions')
  chatCompletions(@Body() body: { messages?: Array<{ content?: string }> }) {
    const system = String(body?.messages?.[0]?.content ?? '');
    const user = String(body?.messages?.at(-1)?.content ?? '');
    const content = buildMockContent(system, user);

    return {
      choices: [
        {
          message: { content },
        },
      ],
    };
  }
}
