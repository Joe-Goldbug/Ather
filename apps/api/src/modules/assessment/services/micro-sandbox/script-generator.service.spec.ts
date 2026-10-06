// apps/api/src/modules/assessment/services/micro-sandbox/script-generator.service.spec.ts
//
// Tests for ScriptGeneratorService:
//   - selectTemplate picks the right template by scenario_type (sync, no API key needed)
//   - generateScript returns a script whose narratives include the user's
//     injected variables (only runs when DYNAMIC_SCRIPT_API_KEY is set)

import { describe, test, expect, beforeAll } from '@jest/globals';
import { ScriptGeneratorService } from './script-generator.service.js';
import { DynamicScriptFunnelConfig } from '../../../../common/minimax/dynamic-script-funnel.config.js';

describe('ScriptGeneratorService', () => {
  let service: ScriptGeneratorService;
  const apiKey = process.env.DYNAMIC_SCRIPT_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      console.warn('DYNAMIC_SCRIPT_API_KEY not set; live generateScript test will be skipped');
      return;
    }
    const funnelConfig = new DynamicScriptFunnelConfig(process.env);
    service = new ScriptGeneratorService(funnelConfig);
  });

  test('selectTemplate picks work-conflict for scenario_type=work', () => {
    const svc = service ?? new ScriptGeneratorService(
      new DynamicScriptFunnelConfig({
        DYNAMIC_SCRIPT_API_KEY: 'test',
        DYNAMIC_SCRIPT_API_BASE: 'https://api.minimaxi.com',
      }),
    );
    expect(svc.selectTemplate({ scenario_type: 'work' } as any).template_id).toBe('work-conflict-v1');
  });

  test('selectTemplate picks family-conflict for scenario_type=family', () => {
    const svc = service ?? new ScriptGeneratorService(
      new DynamicScriptFunnelConfig({
        DYNAMIC_SCRIPT_API_KEY: 'test',
        DYNAMIC_SCRIPT_API_BASE: 'https://api.minimaxi.com',
      }),
    );
    expect(svc.selectTemplate({ scenario_type: 'family' } as any).template_id).toBe('family-conflict-v1');
  });

  test('selectTemplate picks relationship for scenario_type=romantic', () => {
    const svc = service ?? new ScriptGeneratorService(
      new DynamicScriptFunnelConfig({
        DYNAMIC_SCRIPT_API_KEY: 'test',
        DYNAMIC_SCRIPT_API_BASE: 'https://api.minimaxi.com',
      }),
    );
    expect(svc.selectTemplate({ scenario_type: 'romantic' } as any).template_id).toBe('relationship-v1');
  });

  test('generateScript returns script with variables injected into narratives', async () => {
    if (!apiKey || !service) return;
    const variables = {
      scenario_type: 'work' as const,
      trigger_event: '李明公开质疑我的市场分析',
      primary_emotion: '愤怒',
      emotion_intensity: 0.8,
      emotional_response: '觉得不被尊重',
      key_persons: [{ name: '李明', relationship: '5年同事', relationship_quality: 0.3 }],
      coping_strategy: '沉默离开',
    };
    const script = await service.generateScript(variables, 'zh-CN');
    expect(script.scenes.length).toBeGreaterThanOrEqual(3);
    expect(script.scenes.length).toBeLessThanOrEqual(5);
    // Variables must appear in the narrative
    const allNarratives = script.scenes.map((s) => s.narrative).join('\n');
    expect(allNarratives).toContain('李明');
    expect(allNarratives).toContain('市场分析');
    expect(script.metadata.variable_usage.key_person_name).toBe(true);
    // jest 的超时是第三个位置参数（数字），不接受 vitest/bun 的对象形式。
  }, 60000);
});