import { GoneException } from '@nestjs/common';
import { AssessmentController } from './assessment.controller.js';

describe('retired legacy assessment writes', () => {
  const legacy = {
    complete: jest.fn(),
    microSandboxNext: jest.fn(),
    completeMicroSandbox: jest.fn(),
    getLatest: jest.fn(),
  };
  const controller = new AssessmentController(legacy as never);
  const request = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['complete', () => controller.complete({} as never, request)],
    ['micro next', () => controller.microSandboxNext({} as never, request)],
    ['micro complete', () => controller.microSandboxComplete({} as never, request)],
  ])('returns 410 for %s instead of invoking the old writer', async (_name, invoke) => {
    await expect(invoke()).rejects.toBeInstanceOf(GoneException);
    expect(legacy.complete).not.toHaveBeenCalled();
    expect(legacy.microSandboxNext).not.toHaveBeenCalled();
    expect(legacy.completeMicroSandbox).not.toHaveBeenCalled();
  });
});
