import 'reflect-metadata';
import { describe, test, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlayDynamicScriptDto, PlayDynamicScriptParamsDto } from './dynamic-script-playback.dto.js';

describe('playback DTO', () => {
  test('accepts UUID script and nested choice array', async () => {
    expect(await validate(plainToInstance(PlayDynamicScriptParamsDto, { script_id: '11111111-2222-4333-8444-555555555555' }))).toHaveLength(0);
    expect(await validate(plainToInstance(PlayDynamicScriptDto, { played_path: [{ scene_id: 's1', choice_id: 'c1' }] }))).toHaveLength(0);
  });
  test('rejects invalid UUID', async () => {
    expect((await validate(plainToInstance(PlayDynamicScriptParamsDto, { script_id: 'invalid' }))).length).toBeGreaterThan(0);
  });
  test.each([undefined, null, [], 'path', {}, [null], ['s1'], [{}], [{ scene_id: '', choice_id: 1 }]])('rejects invalid played_path %j', async (played_path) => {
    expect((await validate(plainToInstance(PlayDynamicScriptDto, { played_path }))).length).toBeGreaterThan(0);
  });
});
