import { ThemeFollowupGeneratorService } from './theme-followup-generator.service.js';
import { selectThemeRoundCore, decideThemeRoundFollowUp, type ThemeOptionId } from '@eva/core';

describe('ThemeFollowupGeneratorService', () => {
  it('uses the reviewed fallback when provider configuration is incomplete', async () => {
    const original = {
      base: process.env.LLM_BASE_URL,
      key: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      timeout: process.env.THEME_FOLLOWUP_TIMEOUT_MS,
    };
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.THEME_FOLLOWUP_TIMEOUT_MS;
    const questions = selectThemeRoundCore('relationship', 0);
    const answers = questions.map((question, index) => ({
      question_id: question.question_id,
      choice_id: (index % 2 === 0 ? 'A' : 'D') as ThemeOptionId,
    }));
    const fallback = decideThemeRoundFollowUp(questions, answers)!;
    await expect(new ThemeFollowupGeneratorService().rephrase(fallback, answers)).resolves.toEqual(
      fallback
    );
    for (const [key, value] of Object.entries({
      LLM_BASE_URL: original.base,
      LLM_API_KEY: original.key,
      LLM_MODEL: original.model,
      THEME_FOLLOWUP_TIMEOUT_MS: original.timeout,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('passes consented current-round context and the latest follow-up answer to the bounded provider', async () => {
    const originalFetch = global.fetch;
    const originalEnv = {
      base: process.env.LLM_BASE_URL,
      key: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      timeout: process.env.THEME_FOLLOWUP_TIMEOUT_MS,
    };
    process.env.LLM_BASE_URL = 'https://model.example';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.THEME_FOLLOWUP_TIMEOUT_MS = '1000';
    let requestBody = '';
    global.fetch = jest.fn(async (_url, init) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  prompt: '当对方继续追问你的真实想法时，你接下来会怎么回应？',
                  options: [
                    '先说明自己的顾虑，再确认对方想知道什么。',
                    '先问清楚对方为什么要继续追问。',
                    '暂时保留，只回应自己确定的部分。',
                    '先结束这段讨论，等更合适时再谈。',
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;
    const questions = selectThemeRoundCore('relationship', 0);
    const answers = questions.map((question, index) => ({
      question_id: question.question_id,
      choice_id: (index % 2 === 0 ? 'A' : 'D') as ThemeOptionId,
      free_text: index === 5 ? '只在对方是直属上级时发生。' : undefined,
    }));
    const fallback = decideThemeRoundFollowUp(questions, answers)!;

    await new ThemeFollowupGeneratorService().rephrase(fallback, answers);

    expect(requestBody).toContain('只在对方是直属上级时发生');
    expect(requestBody).toContain(answers[5]!.question_id);

    global.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      LLM_BASE_URL: originalEnv.base,
      LLM_API_KEY: originalEnv.key,
      LLM_MODEL: originalEnv.model,
      THEME_FOLLOWUP_TIMEOUT_MS: originalEnv.timeout,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
