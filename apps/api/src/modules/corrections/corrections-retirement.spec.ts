import { GoneException } from '@nestjs/common';
import { CorrectionsController } from './corrections.controller.js';
import type { CorrectionsService } from './corrections.service.js';

describe('CorrectionsController legacy write retirement', () => {
  it('returns 410 and does not expose the legacy write path', () => {
    const controller = new CorrectionsController({} as CorrectionsService);

    expect(() => controller.create()).toThrow(GoneException);

    try {
      controller.create();
    } catch (error) {
      const response = (error as GoneException).getResponse() as {
        code: string;
        message: string;
      };
      expect((error as GoneException).getStatus()).toBe(410);
      expect(response.code).toBe('legacy_corrections_retired');
      expect(response.message).toContain('主题测试结果或正式观察');
    }
  });
});
